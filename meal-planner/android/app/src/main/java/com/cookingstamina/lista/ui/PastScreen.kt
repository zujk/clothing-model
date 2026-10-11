package com.cookingstamina.lista.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CheckboxDefaults
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.rememberModalBottomSheetState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cookingstamina.lista.Snapshot
import com.cookingstamina.lista.Store
import com.cookingstamina.lista.Weeks

@Composable
fun PastScreen(store: Store, who: String, onSettings: () -> Unit, modifier: Modifier = Modifier) {
    val snap by store.snapshot.collectAsState()
    val status by store.status.collectAsState()
    var sheet by remember { mutableStateOf(false) }

    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item { Header("", "Past weeks") { StatusPill(status) } }
        item {
            Button(
                onClick = { sheet = true },
                modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = Palette.Green, contentColor = Color.White),
            ) { Text("Start week of ${Weeks.label(Weeks.next(snap.weekStart))}", fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
        }
        if (snap.pastWeeks.isEmpty()) {
            item {
                Text(
                    "Dishes you've cooked show up here once a week is over.",
                    color = Palette.Muted,
                    fontSize = 15.sp,
                )
            }
        }
        items(snap.pastWeeks, key = { it.start }) { w ->
            Card {
                Column(Modifier.padding(horizontal = 16.dp, vertical = 14.dp), verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Text("Week of ${Weeks.label(w.start)}", fontWeight = FontWeight.SemiBold, fontSize = 16.sp, color = Palette.Ink)
                    Text(
                        w.dishes.joinToString(" · "),
                        fontSize = 14.sp,
                        color = Palette.Muted,
                        maxLines = 3,
                        overflow = TextOverflow.Ellipsis,
                    )
                }
            }
        }
        item {
            TextButton(onClick = onSettings) { Text("Signed in as $who · Settings", color = Palette.Muted) }
        }
    }

    if (sheet) {
        NewWeekSheet(
            snap = snap,
            onStart = { dishes, items -> store.startNewWeek(dishes, items) },
            onDismiss = { sheet = false },
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun NewWeekSheet(snap: Snapshot, onStart: (Set<String>, Set<String>) -> Unit, onDismiss: () -> Unit) {
    val dishes = snap.dishes.filter { !it.done }
    val items = snap.items.filter { !it.inCart }
    var keepDishes by remember { mutableStateOf(dishes.map { it.id }.toSet()) }
    var keepItems by remember { mutableStateOf(items.map { it.id }.toSet()) }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true),
        containerColor = Color.White,
    ) {
        Column(
            Modifier.verticalScroll(rememberScrollState()).padding(start = 20.dp, end = 20.dp, bottom = 28.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    "Start week of ${Weeks.label(Weeks.next(snap.weekStart))}?",
                    fontSize = 26.sp,
                    fontWeight = FontWeight.Bold,
                    color = Palette.Ink,
                )
                Text("This week moves to Past weeks. Keep what's left over:", fontSize = 15.sp, color = Palette.Muted)
            }
            if (dishes.isNotEmpty()) {
                Column {
                    SectionLabel("Not cooked yet")
                    dishes.forEach { d ->
                        CheckLine(d.name, d.id in keepDishes) {
                            keepDishes = if (d.id in keepDishes) keepDishes - d.id else keepDishes + d.id
                        }
                    }
                }
            }
            if (items.isNotEmpty()) {
                Column {
                    SectionLabel("Still to buy")
                    items.forEach { item ->
                        CheckLine(item.name, item.id in keepItems) {
                            keepItems = if (item.id in keepItems) keepItems - item.id else keepItems + item.id
                        }
                    }
                }
            }
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Button(
                    onClick = {
                        onStart(keepDishes, keepItems)
                        onDismiss()
                    },
                    modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = Palette.Green, contentColor = Color.White),
                ) { Text("Start new week", fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
                TextButton(onClick = onDismiss, modifier = Modifier.fillMaxWidth().heightIn(min = 44.dp)) {
                    Text("Not now", fontSize = 16.sp, color = Palette.Green)
                }
            }
        }
    }
}

@Composable
private fun CheckLine(text: String, checked: Boolean, onToggle: () -> Unit) {
    Row(
        Modifier
            .fillMaxWidth()
            .heightIn(min = 44.dp)
            .toggleable(value = checked, role = Role.Checkbox, onValueChange = { onToggle() }),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Checkbox(
            checked = checked,
            onCheckedChange = null,
            colors = CheckboxDefaults.colors(checkedColor = Palette.Green),
        )
        Text(text, fontSize = 16.sp, color = Palette.Ink, modifier = Modifier.padding(start = 12.dp))
    }
}
