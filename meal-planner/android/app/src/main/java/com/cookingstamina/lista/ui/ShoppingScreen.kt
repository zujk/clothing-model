package com.cookingstamina.lista.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.BorderStroke
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cookingstamina.lista.Item
import com.cookingstamina.lista.Store
import com.cookingstamina.lista.oftenItems

@OptIn(ExperimentalLayoutApi::class)
@Composable
fun ShoppingScreen(store: Store, modifier: Modifier = Modifier) {
    val snap by store.snapshot.collectAsState()
    val status by store.status.collectAsState()
    val shopper by store.partnerShopping.collectAsState()
    var draft by remember { mutableStateOf("") }
    var editing by remember { mutableStateOf<Item?>(null) }
    var cartOpen by rememberSaveable { mutableStateOf(false) }

    val todo = snap.items.filter { !it.inCart }
    val cart = snap.items.filter { it.inCart }
    val often = remember(snap) { oftenItems(snap) }

    fun submit() {
        store.addItem(draft)
        draft = ""
    }

    LazyColumn(
        modifier.fillMaxSize(),
        contentPadding = PaddingValues(start = 20.dp, end = 20.dp, top = 12.dp, bottom = 24.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        item {
            Header("${todo.size} to buy · ${cart.size} in the cart", "Shopping") { StatusPill(status, shopper) }
        }
        item {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                AddField(draft, { draft = it }, "Add item…", ::submit)
                if (often.isNotEmpty()) {
                    FlowRow(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalArrangement = Arrangement.spacedBy(8.dp),
                    ) {
                        Text(
                            "Often:",
                            fontSize = 13.sp,
                            color = Palette.Muted,
                            modifier = Modifier.heightIn(min = 34.dp).wrapContentHeight(Alignment.CenterVertically),
                        )
                        often.forEach { name -> Chip("+ $name") { store.addItem(name) } }
                    }
                }
            }
        }
        item {
            Card {
                if (todo.isEmpty()) {
                    Text(
                        "Nothing to buy. Add something above.",
                        modifier = Modifier.padding(16.dp),
                        color = Palette.Muted,
                        fontSize = 15.sp,
                    )
                } else {
                    Column(Modifier.padding(vertical = 2.dp)) {
                        todo.forEachIndexed { i, item ->
                            ItemRow(item, checked = false, onToggle = { store.toggleItem(item.id) }, onEdit = { editing = item })
                            if (i < todo.lastIndex) HorizontalDivider(color = Palette.Divider)
                        }
                    }
                }
            }
        }
        if (cart.isNotEmpty()) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Row(
                        Modifier
                            .heightIn(min = 32.dp)
                            .clickable(onClickLabel = if (cartOpen) "Collapse" else "Expand") { cartOpen = !cartOpen },
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(6.dp),
                    ) {
                        Icon(
                            if (cartOpen) Icons.Default.KeyboardArrowUp else Icons.Default.KeyboardArrowDown,
                            contentDescription = null,
                            tint = Palette.Muted,
                            modifier = Modifier.size(18.dp),
                        )
                        SectionLabel("In the cart (${cart.size})")
                    }
                    if (cartOpen) {
                        Card {
                            Column(Modifier.padding(vertical = 2.dp)) {
                                cart.forEachIndexed { i, item ->
                                    ItemRow(item, checked = true, onToggle = { store.toggleItem(item.id) }, onEdit = { editing = item })
                                    if (i < cart.lastIndex) HorizontalDivider(color = Palette.Divider)
                                }
                            }
                        }
                    } else {
                        Text(
                            cart.joinToString(" · ") { it.name },
                            fontSize = 15.sp,
                            lineHeight = 24.sp,
                            color = Palette.Done,
                            textDecoration = TextDecoration.LineThrough,
                        )
                    }
                }
            }
        }
    }

    editing?.let { item ->
        TextDialog(
            title = "Item",
            firstLabel = "Name", first = item.name,
            secondLabel = "Note", second = item.note,
            onSave = { name, note -> store.editItem(item.id, name, note) },
            onDelete = { store.deleteItem(item.id) },
            onDismiss = { editing = null },
        )
    }
}

@Composable
private fun ItemRow(item: Item, checked: Boolean, onToggle: () -> Unit, onEdit: () -> Unit) {
    Row(
        Modifier.fillMaxWidth().padding(start = 5.dp, end = 14.dp),
        verticalAlignment = Alignment.Top,
    ) {
        TickBox(
            checked = checked,
            round = false,
            label = if (checked) "Put back: ${item.name}" else "Check off: ${item.name}",
            onClick = onToggle,
        )
        Column(
            Modifier.weight(1f).clickable(onClick = onEdit).padding(start = 3.dp, top = 10.dp, bottom = 10.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp),
        ) {
            Text(
                item.name,
                fontSize = 16.sp,
                lineHeight = 21.sp,
                color = if (checked) Palette.Done else Palette.Ink,
                textDecoration = if (checked) TextDecoration.LineThrough else TextDecoration.None,
            )
            if (item.note.isNotEmpty()) {
                Text(item.note, fontSize = 13.sp, lineHeight = 18.sp, color = Palette.Note)
            }
        }
    }
}

@Composable
private fun Chip(text: String, onClick: () -> Unit) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(50),
        color = Color.White,
        border = BorderStroke(1.dp, Color(0xFFC9CCC2)),
        modifier = Modifier.heightIn(min = 34.dp),
    ) {
        Row(Modifier.padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(text, fontSize = 14.sp, color = Palette.Ink, fontWeight = FontWeight.Normal)
        }
    }
}
