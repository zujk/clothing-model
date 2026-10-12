package com.cookingstamina.lista

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull

data class Config(val server: String, val key: String, val who: String)

/**
 * Keeps the phone in step with the server while the app is on screen:
 * sync, then hold a long-poll open until the partner (or we) change something.
 */
class SyncController(private val store: Store, private val scope: CoroutineScope) {
    private val wake = Channel<Unit>(Channel.CONFLATED)
    private var job: Job? = null

    /** True while the Shopping tab is open; the partner sees "<name> is shopping". */
    @Volatile
    var shopping = false
        set(value) {
            if (field != value) {
                field = value
                kick()
            }
        }

    init {
        store.onLocalChange = { kick() }
    }

    fun kick() {
        wake.trySend(Unit)
    }

    fun start(config: Config) {
        stop()
        job = scope.launch(Dispatchers.IO) { run(SyncApi(config.server, config.key), config.who) }
    }

    fun stop() {
        job?.cancel()
        job = null
    }

    private suspend fun run(api: SyncApi, who: String) {
        try {
            coroutineScope {
                while (true) {
                    if (!store.sync(api, who, shopping)) {
                        // offline or wrong key: retry in a few seconds, or sooner after a local edit
                        withTimeoutOrNull(5_000) { wake.receive() }
                        continue
                    }
                    val waiter = launch {
                        try {
                            api.waitForChange(store.serverVersion)
                        } catch (e: CancellationException) {
                            throw e
                        } catch (e: Exception) {
                            delay(3_000)
                        }
                        wake.trySend(Unit)
                    }
                    wake.receive()
                    waiter.cancel()
                }
            }
        } finally {
            // tell the partner we've stopped shopping
            withContext(NonCancellable) { store.sync(api, who, false) }
        }
    }
}
