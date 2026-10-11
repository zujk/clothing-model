package com.cookingstamina.lista

import android.app.Application
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import java.io.File

class ListaApp : Application() {
    lateinit var store: Store
        private set
    lateinit var sync: SyncController
        private set

    private val prefs by lazy { getSharedPreferences("lista", MODE_PRIVATE) }
    private val _config = MutableStateFlow<Config?>(null)
    val config: StateFlow<Config?> = _config

    override fun onCreate() {
        super.onCreate()
        store = Store(File(filesDir, "state.json"))
        sync = SyncController(store, CoroutineScope(SupervisorJob() + Dispatchers.Default))
        val server = prefs.getString("server", null)
        val key = prefs.getString("key", null)
        val who = prefs.getString("who", null)
        if (server != null && key != null && who != null) _config.value = Config(server, key, who)
    }

    fun saveConfig(c: Config) {
        val old = _config.value
        // a different server or key means a different household: drop the local copy
        if (old != null && (old.server != c.server || old.key != c.key)) store.reset()
        prefs.edit().putString("server", c.server).putString("key", c.key).putString("who", c.who).apply()
        _config.value = c
        sync.start(c)
    }

    fun startSync() {
        _config.value?.let { sync.start(it) }
    }
}
