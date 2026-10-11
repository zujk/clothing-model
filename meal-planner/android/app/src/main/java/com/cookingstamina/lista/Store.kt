package com.cookingstamina.lista

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.time.LocalDate
import java.util.UUID
import java.util.concurrent.Executors

private const val META_WEEK = "meta-week"

/**
 * Local copy of the household's data. Every edit is stored on the phone first and
 * marked "pending"; [sync] pushes pending edits and pulls the partner's.
 */
class Store(
    private val file: File,
    private val clock: () -> Long = System::currentTimeMillis,
    private val today: () -> LocalDate = { LocalDate.now() },
) {
    private val lock = Any()
    private val records = HashMap<String, Record>()
    private val pending = LinkedHashSet<String>()
    private var rev = 0L

    @Volatile
    var serverVersion = 0L
        private set

    private val _snapshot = MutableStateFlow(buildSnapshot())
    val snapshot: StateFlow<Snapshot> = _snapshot

    private val _status = MutableStateFlow(SyncStatus.Connecting)
    val status: StateFlow<SyncStatus> = _status

    private val _partnerShopping = MutableStateFlow<String?>(null)
    val partnerShopping: StateFlow<String?> = _partnerShopping

    /** Called after every local edit so the sync loop can push it right away. */
    @Volatile
    var onLocalChange: () -> Unit = {}

    private val writer = Executors.newSingleThreadExecutor { r -> Thread(r, "store-writer").apply { isDaemon = true } }

    init {
        load()
        _snapshot.value = buildSnapshot()
    }

    // ---- dishes -------------------------------------------------------------

    fun addDish(name: String) = mutate {
        val n = name.trim()
        val week = currentWeek()
        val dup = liveOf("dish").any { it.data.optString("week") == week && it.data.optString("name").key() == n.key() }
        if (n.isEmpty() || dup) return@mutate
        put("dish", newId(), JSONObject().put("name", n).put("week", week).put("done", false).put("order", clock()))
    }

    fun toggleDish(id: String) = edit(id) { it.put("done", !it.optBoolean("done")) }
    fun renameDish(id: String, name: String) = edit(id) { if (name.isNotBlank()) it.put("name", name.trim()) }
    fun deleteDish(id: String) = mutate { remove(id) }

    // ---- shopping -----------------------------------------------------------

    fun addItem(name: String) = mutate {
        val n = name.trim()
        if (n.isEmpty()) return@mutate
        val existing = liveOf("item").firstOrNull { !it.data.optBoolean("archived") && it.data.optString("name").key() == n.key() }
        if (existing != null) {
            // already on the list: just make sure it's not ticked off
            if (existing.data.optBoolean("inCart")) put("item", existing.id, existing.data.copy().put("inCart", false))
            return@mutate
        }
        put(
            "item", newId(),
            JSONObject().put("name", n).put("note", "").put("inCart", false).put("archived", false).put("order", clock())
        )
    }

    fun toggleItem(id: String) = edit(id) { it.put("inCart", !it.optBoolean("inCart")) }
    fun editItem(id: String, name: String, note: String) = edit(id) {
        if (name.isNotBlank()) it.put("name", name.trim())
        it.put("note", note.trim())
    }

    fun deleteItem(id: String) = mutate { remove(id) }

    // ---- "of the week" ------------------------------------------------------

    fun addExtra(label: String, text: String) = mutate {
        if (label.isBlank() && text.isBlank()) return@mutate
        put(
            "extra", newId(),
            JSONObject().put("label", label.trim()).put("text", text.trim()).put("week", currentWeek()).put("order", clock())
        )
    }

    fun editExtra(id: String, label: String, text: String) = edit(id) {
        it.put("label", label.trim()).put("text", text.trim())
    }

    fun deleteExtra(id: String) = mutate { remove(id) }

    // ---- new week -----------------------------------------------------------

    /**
     * Moves to the next week. Uncooked dishes in [keepDishes] and unbought items in [keepItems]
     * carry over; bought items are archived (they feed the "Often" chips); the rest is dropped.
     */
    fun startNewWeek(keepDishes: Set<String>, keepItems: Set<String>) = mutate {
        val old = currentWeek()
        val new = Weeks.next(old)
        for (r in liveOf("dish")) {
            if (r.data.optString("week") == old && !r.data.optBoolean("done") && r.id in keepDishes) {
                put("dish", r.id, r.data.copy().put("week", new))
            }
        }
        for (r in liveOf("item")) {
            if (r.data.optBoolean("archived")) continue
            when {
                r.data.optBoolean("inCart") -> put("item", r.id, r.data.copy().put("archived", true))
                r.id !in keepItems -> remove(r.id)
            }
        }
        for (r in liveOf("extra")) if (r.data.optString("week") == old) remove(r.id)
        put("meta", META_WEEK, JSONObject().put("start", new))
    }

    /** Forget everything local (used when switching to a different household/server). */
    fun reset() {
        synchronized(lock) {
            records.clear()
            pending.clear()
            rev = 0
            serverVersion = 0
            _snapshot.value = buildSnapshot()
            persist()
        }
        _partnerShopping.value = null
        _status.value = SyncStatus.Connecting
    }

    // ---- sync ---------------------------------------------------------------

    /** One round trip. Returns false when the server couldn't be reached. */
    suspend fun sync(api: SyncApi, who: String, shopping: Boolean): Boolean {
        val (sent, since) = synchronized(lock) { pending.mapNotNull { records[it] } to rev }
        return try {
            val r = api.sync(since, who, shopping, sent)
            var createdMeta = false
            synchronized(lock) {
                for (s in sent) if (records[s.id]?.updated == s.updated) pending.remove(s.id)
                for (rec in r.records) {
                    val cur = records[rec.id]
                    if (cur == null || rec.updated >= cur.updated) records[rec.id] = rec
                }
                rev = r.rev
                serverVersion = r.version
                // First ever sync of the household: pin the current week so both phones agree on it.
                if (records[META_WEEK] == null) {
                    put("meta", META_WEEK, JSONObject().put("start", currentWeek()))
                    createdMeta = true
                }
                _snapshot.value = buildSnapshot()
                persist()
            }
            _partnerShopping.value = r.shopping.firstOrNull()
            _status.value = SyncStatus.Online
            if (createdMeta) onLocalChange()
            true
        } catch (e: CancellationException) {
            throw e
        } catch (e: BadKeyException) {
            _status.value = SyncStatus.BadKey
            false
        } catch (e: Exception) {
            _status.value = SyncStatus.Offline
            false
        }
    }

    // ---- internals ----------------------------------------------------------

    private fun currentWeek(): String =
        records[META_WEEK]?.takeIf { !it.deleted }?.data?.optString("start")?.takeIf { it.isNotEmpty() }
            ?: Weeks.defaultStart(today())

    private fun liveOf(type: String): List<Record> = records.values.filter { it.type == type && !it.deleted }

    private fun newId() = UUID.randomUUID().toString()

    private fun JSONObject.copy() = JSONObject(toString())

    private fun String.key() = trim().lowercase()

    private fun mutate(block: () -> Unit) {
        synchronized(lock) {
            block()
            _snapshot.value = buildSnapshot()
            persist()
        }
        onLocalChange()
    }

    private fun edit(id: String, change: (JSONObject) -> Unit) = mutate {
        val r = records[id]
        if (r != null && !r.deleted) {
            val d = r.data.copy()
            change(d)
            put(r.type, id, d)
        }
    }

    private fun put(type: String, id: String, data: JSONObject) {
        val t = maxOf(clock(), (records[id]?.updated ?: 0L) + 1) // never older than what we already saw
        records[id] = Record(id, type, data, t, false)
        pending.add(id)
    }

    private fun remove(id: String) {
        val r = records[id] ?: return
        if (r.deleted) return
        records[id] = Record(id, r.type, JSONObject(), maxOf(clock(), r.updated + 1), true)
        pending.add(id)
    }

    private fun buildSnapshot(): Snapshot {
        val week = currentWeek()
        val allDishes = liveOf("dish").map {
            Dish(it.id, it.data.optString("name"), it.data.optString("week"), it.data.optBoolean("done"), it.data.optLong("order"))
        }.sortedBy { it.order }
        val allItems = liveOf("item").map {
            Item(
                it.id, it.data.optString("name"), it.data.optString("note"),
                it.data.optBoolean("inCart"), it.data.optBoolean("archived"), it.data.optLong("order"),
            )
        }.sortedBy { it.order }
        val extras = liveOf("extra").map {
            Extra(it.id, it.data.optString("label"), it.data.optString("text"), it.data.optString("week"), it.data.optLong("order"))
        }.filter { it.week == week }.sortedBy { it.order }

        val past = allDishes
            .filter { it.done && it.week < week }
            .groupBy { it.week }
            .toList()
            .sortedByDescending { it.first }
            .map { (start, list) -> PastWeek(start, list.map { it.name }) }

        return Snapshot(
            weekStart = week,
            dishes = allDishes.filter { it.week == week },
            extras = extras,
            items = allItems.filter { !it.archived },
            pastWeeks = past,
            cooked = allDishes.filter { it.done },
            bought = allItems.filter { it.archived },
        )
    }

    // ---- local storage ------------------------------------------------------

    private fun persist() {
        val arr = JSONArray()
        for (r in records.values) {
            arr.put(
                JSONObject().put("id", r.id).put("type", r.type).put("data", r.data)
                    .put("updated", r.updated).put("deleted", r.deleted)
            )
        }
        val text = JSONObject().put("rev", rev).put("records", arr).put("pending", JSONArray(pending.toList())).toString()
        writer.execute {
            try {
                val tmp = File(file.path + ".tmp")
                tmp.writeText(text)
                tmp.renameTo(file)
            } catch (_: Exception) {
            }
        }
    }

    private fun load() {
        try {
            if (!file.exists()) return
            val root = JSONObject(file.readText())
            rev = root.optLong("rev")
            val arr = root.getJSONArray("records")
            for (i in 0 until arr.length()) {
                val o = arr.getJSONObject(i)
                records[o.getString("id")] = Record(
                    o.getString("id"), o.getString("type"), o.optJSONObject("data") ?: JSONObject(),
                    o.getLong("updated"), o.optBoolean("deleted"),
                )
            }
            val p = root.optJSONArray("pending")
            if (p != null) for (i in 0 until p.length()) if (records.containsKey(p.getString(i))) pending.add(p.getString(i))
        } catch (_: Exception) {
            // unreadable file: start clean, the server still has everything that was synced
            records.clear(); pending.clear(); rev = 0
        }
    }
}
