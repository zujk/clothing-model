package com.cookingstamina.lista.ui

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cookingstamina.lista.SyncStatus

/** Colours from the mockup. */
object Palette {
    val Bg = Color(0xFFF4F3EE)
    val Ink = Color(0xFF1E2621)
    val Muted = Color(0xFF5B645E)
    val Green = Color(0xFF2E6A4C)
    val GreenDot = Color(0xFF9FE0BC)
    val Line = Color(0xFFDEDDD5)
    val Divider = Color(0xFFEEEDE7)
    val Ring = Color(0xFF9AA39D)
    val Done = Color(0xFF6B736E)
    val Highlight = Color(0xFFEAF2EC)
    val Note = Color(0xFF8A5A0B)
    val SandBg = Color(0xFFF6E7C1)
    val SandInk = Color(0xFF6B4E0E)
    val SkyBg = Color(0xFFDCE8F0)
    val SkyInk = Color(0xFF234A63)
    val Danger = Color(0xFFB3261E)
}

@Composable
fun ListaTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = lightColorScheme(
            primary = Palette.Green,
            onPrimary = Color.White,
            background = Palette.Bg,
            onBackground = Palette.Ink,
            surface = Color.White,
            onSurface = Palette.Ink,
            secondaryContainer = Palette.Highlight,
        ),
        content = content,
    )
}

@Composable
fun Card(modifier: Modifier = Modifier, content: @Composable () -> Unit) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(18.dp),
        color = Color.White,
        border = BorderStroke(1.dp, Palette.Line),
        content = content,
    )
}

@Composable
fun Header(kicker: String, title: String, pill: @Composable () -> Unit = {}) {
    Row(
        Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.Bottom,
    ) {
        Column(Modifier.weight(1f)) {
            if (kicker.isNotEmpty()) {
                Text(kicker, fontSize = 14.sp, color = Palette.Muted, fontWeight = FontWeight.Medium)
            }
            Text(title, fontSize = 34.sp, color = Palette.Ink, fontWeight = FontWeight.Bold, letterSpacing = (-0.7).sp)
        }
        pill()
    }
}

@Composable
fun Pill(text: String, dot: Color, filled: Boolean = false) {
    val shape = RoundedCornerShape(50)
    Row(
        Modifier
            .clip(shape)
            .background(if (filled) Palette.Green else Color.White)
            .then(if (filled) Modifier else Modifier.border(1.dp, Palette.Line, shape))
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Box(Modifier.size(8.dp).clip(CircleShape).background(dot))
        Text(
            text,
            fontSize = 13.sp,
            fontWeight = if (filled) FontWeight.SemiBold else FontWeight.Medium,
            color = if (filled) Color.White else Palette.Green,
        )
    }
}

/** "Shared" when in sync, or who is shopping, or what's wrong. */
@Composable
fun StatusPill(status: SyncStatus, shopper: String? = null) {
    when {
        shopper != null -> Pill("$shopper is shopping", Palette.GreenDot, filled = true)
        status == SyncStatus.Online -> Pill("Shared", Palette.Green)
        status == SyncStatus.Connecting -> Pill("Connecting…", Palette.Ring)
        status == SyncStatus.Offline -> Pill("Offline", Palette.Note)
        status == SyncStatus.BadKey -> Pill("Wrong key", Palette.Danger)
    }
}

@Composable
fun SectionLabel(text: String) {
    Text(
        text.uppercase(),
        fontSize = 13.sp,
        fontWeight = FontWeight.SemiBold,
        letterSpacing = 0.8.sp,
        color = Palette.Muted,
    )
}

/** Round (dishes) or square (shopping) tick box with a 44dp touch target. */
@Composable
fun TickBox(checked: Boolean, round: Boolean, label: String, onClick: () -> Unit) {
    val shape = if (round) CircleShape else RoundedCornerShape(7.dp)
    val size = if (round) 26.dp else 24.dp
    Box(
        Modifier
            .size(44.dp)
            .clickable(onClickLabel = label, role = Role.Checkbox, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            Modifier
                .size(size)
                .clip(shape)
                .background(if (checked) Palette.Green else Color.White)
                .border(2.dp, if (checked) Palette.Green else Palette.Ring, shape),
            contentAlignment = Alignment.Center,
        ) {
            if (checked) {
                Icon(Icons.Default.Check, contentDescription = null, tint = Color.White, modifier = Modifier.size(16.dp))
            }
        }
    }
}

/** The "+ Add …" text box used for dishes and shopping items. */
@Composable
fun AddField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    onSubmit: () -> Unit,
    modifier: Modifier = Modifier,
    flat: Boolean = false,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val shape = RoundedCornerShape(12.dp)
    Row(
        modifier
            .fillMaxWidth()
            .heightIn(min = 46.dp)
            .clip(shape)
            .background(if (flat) Palette.Bg else Color.White)
            .border(if (focused) 2.dp else 1.dp, if (focused) Palette.Green else Palette.Line, shape),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            Modifier.size(44.dp).clickable(onClickLabel = "Add", onClick = onSubmit),
            contentAlignment = Alignment.Center,
        ) {
            Icon(Icons.Default.Add, contentDescription = "Add", tint = Palette.Green, modifier = Modifier.size(20.dp))
        }
        BasicTextField(
            value = value,
            onValueChange = onValueChange,
            singleLine = true,
            interactionSource = source,
            textStyle = TextStyle(fontSize = 16.sp, color = Palette.Ink),
            cursorBrush = SolidColor(Palette.Green),
            keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences, imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { onSubmit() }),
            modifier = Modifier.weight(1f).padding(end = 12.dp),
            decorationBox = { inner ->
                Box(contentAlignment = Alignment.CenterStart) {
                    if (value.isEmpty()) Text(placeholder, fontSize = 16.sp, color = Palette.Ring)
                    inner()
                }
            },
        )
    }
}

/** Edit one or two text fields, with an optional Delete. */
@Composable
fun TextDialog(
    title: String,
    firstLabel: String,
    first: String,
    secondLabel: String?,
    second: String,
    onSave: (String, String) -> Unit,
    onDelete: (() -> Unit)?,
    onDismiss: () -> Unit,
) {
    var a by remember { mutableStateOf(first) }
    var b by remember { mutableStateOf(second) }
    AlertDialog(
        onDismissRequest = onDismiss,
        containerColor = Color.White,
        title = { Text(title) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                OutlinedTextField(
                    value = a,
                    onValueChange = { a = it },
                    label = { Text(firstLabel) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                if (secondLabel != null) {
                    OutlinedTextField(
                        value = b,
                        onValueChange = { b = it },
                        label = { Text(secondLabel) },
                        modifier = Modifier.fillMaxWidth(),
                    )
                }
            }
        },
        confirmButton = {
            TextButton(onClick = { onSave(a, b); onDismiss() }) { Text("Save") }
        },
        dismissButton = {
            Row {
                if (onDelete != null) {
                    TextButton(
                        onClick = { onDelete(); onDismiss() },
                        colors = ButtonDefaults.textButtonColors(contentColor = Palette.Danger),
                    ) { Text("Delete") }
                }
                TextButton(onClick = onDismiss) { Text("Cancel") }
            }
        },
    )
}
