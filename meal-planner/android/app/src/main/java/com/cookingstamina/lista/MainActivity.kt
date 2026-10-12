package com.cookingstamina.lista

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.DateRange
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import com.cookingstamina.lista.ui.ListaTheme
import com.cookingstamina.lista.ui.Palette
import com.cookingstamina.lista.ui.PastScreen
import com.cookingstamina.lista.ui.SetupScreen
import com.cookingstamina.lista.ui.ShoppingScreen
import com.cookingstamina.lista.ui.WeekScreen

class MainActivity : ComponentActivity() {
    private val app get() = application as ListaApp

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent { ListaTheme { Root(app) } }
    }

    override fun onStart() {
        super.onStart()
        app.startSync()
    }

    override fun onStop() {
        super.onStop()
        app.sync.stop()
    }
}

@Composable
private fun Root(app: ListaApp) {
    val config by app.config.collectAsState()
    var settingsOpen by rememberSaveable { mutableStateOf(false) }
    val cfg = config

    if (cfg == null || settingsOpen) {
        SetupScreen(
            initial = cfg,
            onSave = {
                app.saveConfig(it)
                settingsOpen = false
            },
            onCancel = if (cfg != null) ({ settingsOpen = false }) else null,
            modifier = Modifier.systemBarsPadding().imePadding(),
        )
    } else {
        MainTabs(app, cfg.who, onSettings = { settingsOpen = true })
    }
}

@Composable
private fun MainTabs(app: ListaApp, who: String, onSettings: () -> Unit) {
    var tab by rememberSaveable { mutableIntStateOf(0) }
    LaunchedEffect(tab) { app.sync.shopping = tab == 1 }

    Scaffold(
        containerColor = Palette.Bg,
        bottomBar = {
            NavigationBar(containerColor = Color.White) {
                TabItem(0, tab, Icons.AutoMirrored.Filled.List, "Week") { tab = 0 }
                TabItem(1, tab, Icons.Default.ShoppingCart, "Shopping") { tab = 1 }
                TabItem(2, tab, Icons.Default.DateRange, "Past weeks") { tab = 2 }
            }
        },
    ) { padding ->
        val m = Modifier.padding(padding)
        when (tab) {
            0 -> WeekScreen(app.store, m)
            1 -> ShoppingScreen(app.store, m)
            else -> PastScreen(app.store, who, onSettings, m)
        }
    }
}

@Composable
private fun RowScope.TabItem(
    index: Int,
    selected: Int,
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
) {
    NavigationBarItem(
        selected = index == selected,
        onClick = onClick,
        icon = { Icon(icon, contentDescription = null) },
        label = { Text(label) },
        colors = NavigationBarItemDefaults.colors(
            selectedIconColor = Palette.Green,
            selectedTextColor = Palette.Green,
            indicatorColor = Palette.Highlight,
            unselectedIconColor = Palette.Muted,
            unselectedTextColor = Palette.Muted,
        ),
    )
}
