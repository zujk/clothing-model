package com.cookingstamina.lista

import kotlinx.coroutines.suspendCancellableCoroutine
import okhttp3.Call
import okhttp3.Callback
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import okhttp3.Response
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

class BadKeyException : IOException("Wrong household key")

data class SyncResult(
    val rev: Long,
    val version: Long,
    val records: List<Record>,
    /** Names of the *other* people currently shopping. */
    val shopping: List<String>,
)

class SyncApi(server: String, private val key: String) {
    private val base = server.trim().trimEnd('/')
    private val json = "application/json".toMediaType()
    private val client = OkHttpClient.Builder()
        .connectTimeout(10, TimeUnit.SECONDS)
        .readTimeout(20, TimeUnit.SECONDS)
        .callTimeout(30, TimeUnit.SECONDS)
        .build()
    private val waitClient = client.newBuilder()
        .readTimeout(40, TimeUnit.SECONDS)
        .callTimeout(0, TimeUnit.SECONDS)
        .build()

    suspend fun sync(since: Long, who: String, shopping: Boolean, changes: List<Record>): SyncResult {
        val arr = JSONArray()
        for (c in changes) {
            arr.put(
                JSONObject()
                    .put("id", c.id)
                    .put("type", c.type)
                    .put("data", c.data)
                    .put("updated", c.updated)
                    .put("deleted", c.deleted)
            )
        }
        val body = JSONObject()
            .put("since", since)
            .put("who", who)
            .put("shopping", shopping)
            .put("changes", arr)
        val req = Request.Builder()
            .url("$base/api/sync")
            .header("Authorization", "Bearer $key")
            .post(body.toString().toRequestBody(json))
            .build()
        val out = JSONObject(execute(client, req))

        val recs = out.getJSONArray("records")
        val records = (0 until recs.length()).map { i ->
            val r = recs.getJSONObject(i)
            Record(
                id = r.getString("id"),
                type = r.getString("type"),
                data = r.optJSONObject("data") ?: JSONObject(),
                updated = r.getLong("updated"),
                deleted = r.optBoolean("deleted", false),
            )
        }
        val shop = out.optJSONArray("shopping")
        return SyncResult(
            rev = out.getLong("rev"),
            version = out.getLong("version"),
            records = records,
            shopping = if (shop == null) emptyList() else (0 until shop.length()).map { shop.getString(it) },
        )
    }

    /** Returns when the server has something new (or after ~25 s). */
    suspend fun waitForChange(version: Long) {
        val req = Request.Builder()
            .url("$base/api/wait?version=$version")
            .header("Authorization", "Bearer $key")
            .build()
        execute(waitClient, req)
    }

    private suspend fun execute(c: OkHttpClient, req: Request): String {
        val resp = c.newCall(req).await()
        resp.use {
            if (it.code == 401) throw BadKeyException()
            if (!it.isSuccessful) throw IOException("HTTP ${it.code}")
            return it.body?.string() ?: throw IOException("Empty response")
        }
    }
}

private suspend fun Call.await(): Response = suspendCancellableCoroutine { cont ->
    cont.invokeOnCancellation { cancel() }
    enqueue(object : Callback {
        override fun onFailure(call: Call, e: IOException) {
            if (cont.isActive) cont.resumeWithException(e)
        }

        override fun onResponse(call: Call, response: Response) {
            if (cont.isCancelled) response.close() else cont.resume(response)
        }
    })
}
