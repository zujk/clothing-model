package com.cookingstamina.lista.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cookingstamina.lista.Dish
import com.cookingstamina.lista.Extra
import com.cookingstamina.lista.Store
import com.cookingstamina.lista.Suggestion
import com.cookingstamina.lista.Weeks
import com.cookingstamina.lista.dishSuggestions

@Composable
fun WeekScreen(store: Store, modifier: Modifier = Modifier) {
    val snap by store.snapshot.collectAsState()
    val status by store.status.collectAsState()
    var draft by remember { mutableStateOf("") }
    var editingDish by remember { mutableStateOf<Dish?>(null) }
    var editingExtra by remember { mutableStateOf<Extra?>(null) }
    var addingExtra by remember { mutableStateOf(false) }
    val suggestions = remember(snap, draft) { dishSuggestions(snap, draft) }

    fun submit() {
        store.addDish(draft)
        draft = ""
    }

    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        item {
            Header("Week of ${Weeks.label(snap.weekStart)}", "This week") { StatusPill(status) }
        }
        item {
            Card {
                Column(Modifier.padding(vertical = 4.dp)) {
                    snap.dishes.forEach { d ->
                        DishRow(d, onToggle = { store.toggleDish(d.id) }, onEdit = { editingDish = d })
                        HorizontalDivider(color = Palette.Divider)
                    }
                    Column(Modifier.padding(horizontal = 10.dp, vertical = 8.dp)) {
                        AddField(draft, { draft = it }, "Add a dish…", ::submit, flat = true)
                        if (suggestions.isNotEmpty()) {
                            SuggestionList(suggestions, draft) {
                                store.addDish(it.name)
                                draft = ""
                            }
                        }
                    }
                }
            }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                SectionLabel("Of the week")
                snap.extras.forEach { e -> ExtraRow(e) { editingExtra = e } }
                TextButton(onClick = { addingExtra = true }) { Text("+ Add a note for the week", color = Palette.Green) }
            }
        }
    }

    editingDish?.let { d ->
        TextDialog(
            title = "Dish",
            firstLabel = "Name", first = d.name,
            secondLabel = null, second = "",
            onSave = { name, _ -> store.renameDish(d.id, name) },
            onDelete = { store.deleteDish(d.id) },
            onDismiss = { editingDish = null },
        )
    }
    editingExtra?.let { e ->
        TextDialog(
            title = "Of the week",
            firstLabel = "Label (e.g. Freezer)", first = e.label,
            secondLabel = "What", second = e.text,
            onSave = { label, text -> store.editExtra(e.id, label, text) },
            onDelete = { store.deleteExtra(e.id) },
            onDismiss = { editingExtra = null },
        )
    }
    if (addingExtra) {
        TextDialog(
            title = "Of the week",
            firstLabel = "Label (e.g. Freezer)", first = "",
            secondLabel = "What", second = "",
            onSave = { label, text -> store.addExtra(label, text) },
            onDelete = null,
            onDismiss = { addingExtra = false },
        )
    }
}

@Composable
private fun DishRow(d: Dish, onToggle: () -> Unit, onEdit: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(start = 5.dp, end = 14.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        TickBox(
            checked = d.done,
            round = true,
            label = if (d.done) "Mark not cooked: ${d.name}" else "Mark cooked: ${d.name}",
            onClick = onToggle,
        )
        Text(
            d.name,
            modifier = Modifier.weight(1f).clickable(onClick = onEdit).padding(start = 3.dp, top = 10.dp, bottom = 10.dp),
            fontSize = 16.sp,
            lineHeight = 21.sp,
            color = if (d.done) Palette.Done else Palette.Ink,
            textDecoration = if (d.done) TextDecoration.LineThrough else TextDecoration.None,
        )
    }
}

@Composable
private fun SuggestionList(items: List<Suggestion>, query: String, onPick: (Suggestion) -> Unit) {
    val shape = RoundedCornerShape(12.dp)
    Column(
        Modifier
            .padding(top = 6.dp)
            .fillMaxWidth()
            .shadow(6.dp, shape)
            .clip(shape)
            .background(Color.White),
    ) {
        items.forEachIndexed { i, s ->
            Row(
                Modifier
                    .fillMaxWidth()
                    .heightIn(min = 46.dp)
                    .background(if (i == 0) Palette.Highlight else Color.White)
                    .clickable { onPick(s) }
                    .padding(horizontal = 14.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.SpaceBetween,
            ) {
                Text(highlight(s.name, query), fontSize = 15.sp, color = Palette.Ink, modifier = Modifier.weight(1f))
                Text("${s.count}×", fontSize = 12.sp, color = Palette.Muted, modifier = Modifier.padding(start = 8.dp))
            }
            if (i < items.lastIndex) HorizontalDivider(color = Palette.Divider)
        }
    }
}

private fun highlight(name: String, query: String) = buildAnnotatedString {
    val q = query.trim()
    val at = if (q.isEmpty()) -1 else name.indexOf(q, ignoreCase = true)
    if (at < 0) {
        append(name)
    } else {
        append(name.substring(0, at))
        withStyle(SpanStyle(fontWeight = FontWeight.SemiBold)) { append(name.substring(at, at + q.length)) }
        append(name.substring(at + q.length))
    }
}

@Composable
private fun ExtraRow(e: Extra, onClick: () -> Unit) {
    val sky = (e.label.lowercase().hashCode() and 1) == 1
    Row(
        Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(if (sky) Palette.SkyBg else Palette.SandBg)
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 10.dp),
        verticalAlignment = Alignment.Top,
    ) {
        if (e.label.isNotEmpty()) {
            Text(
                e.label,
                modifier = Modifier.width(92.dp),
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                color = if (sky) Palette.SkyInk else Palette.SandInk,
            )
        }
        Text(e.text, fontSize = 15.sp, color = Palette.Ink, modifier = Modifier.weight(1f))
    }
}
