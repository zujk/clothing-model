package com.cookingstamina.lista

import org.json.JSONObject
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.TemporalAdjusters

/** One synced blob. `type` is "dish", "item", "extra" or "meta". Newest `updated` wins. */
data class Record(
    val id: String,
    val type: String,
    val data: JSONObject,
    val updated: Long,
    val deleted: Boolean = false,
)

data class Dish(val id: String, val name: String, val week: String, val done: Boolean, val order: Long)

data class Item(
    val id: String,
    val name: String,
    val note: String,
    val inCart: Boolean,
    val archived: Boolean,
    val order: Long,
)

/** A small "of the week" line such as Freezer: Lasagna. */
data class Extra(val id: String, val label: String, val text: String, val week: String, val order: Long)

data class PastWeek(val start: String, val dishes: List<String>)

data class Suggestion(val name: String, val count: Int)

/** Everything the screens need, derived from the records. */
data class Snapshot(
    val weekStart: String,
    val dishes: List<Dish>,
    val extras: List<Extra>,
    val items: List<Item>,
    val pastWeeks: List<PastWeek>,
    val cooked: List<Dish>,
    val bought: List<Item>,
)

enum class SyncStatus { Connecting, Online, Offline, BadKey }

/** Weeks are keyed by their Monday as an ISO date; on Sunday we already plan the next one. */
object Weeks {
    fun defaultStart(today: LocalDate = LocalDate.now()): String =
        today.plusDays(1).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY)).toString()

    fun next(start: String): String = LocalDate.parse(start).plusDays(7).toString()

    fun label(start: String): String =
        LocalDate.parse(start).format(DateTimeFormatter.ofPattern("d MMM"))
}

private fun String.key() = trim().lowercase()

/** Past dishes matching what you're typing, most-cooked first. */
fun dishSuggestions(s: Snapshot, query: String, limit: Int = 5): List<Suggestion> {
    val q = query.key()
    if (q.isEmpty()) return emptyList()
    val onMenu = s.dishes.map { it.name.key() }.toSet()
    return s.cooked
        .groupBy { it.name.key() }
        .filterKeys { it.contains(q) && it !in onMenu }
        .map { (_, list) -> Suggestion(list.maxByOrNull { it.order }!!.name, list.size) }
        .sortedWith(
            compareByDescending<Suggestion> { it.name.key().startsWith(q) }
                .thenByDescending { it.count }
                .thenBy { it.name }
        )
        .take(limit)
}

/** Things bought at least twice before that aren't on the list right now. */
fun oftenItems(s: Snapshot, limit: Int = 3): List<String> {
    val onList = s.items.map { it.name.key() }.toSet()
    return s.bought
        .groupBy { it.name.key() }
        .filterKeys { it !in onList }
        .filterValues { it.size >= 2 }
        .map { (_, list) -> list.maxByOrNull { it.order }!!.name to list.size }
        .sortedWith(compareByDescending<Pair<String, Int>> { it.second }.thenBy { it.first })
        .take(limit)
        .map { it.first }
}
