package com.cookingstamina.lista.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.painterResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.cookingstamina.lista.BuildConfig
import com.cookingstamina.lista.Config
import com.cookingstamina.lista.R

/** First-run (and Settings) screen: who you are, which server, the shared household key. */
@Composable
fun SetupScreen(initial: Config?, onSave: (Config) -> Unit, onCancel: (() -> Unit)?, modifier: Modifier = Modifier) {
    var who by remember { mutableStateOf(initial?.who ?: "") }
    var server by remember { mutableStateOf(initial?.server ?: BuildConfig.DEFAULT_SERVER) }
    var key by remember { mutableStateOf(initial?.key ?: "") }
    val ready = who.isNotBlank() && server.isNotBlank() && key.isNotBlank()

    Column(
        modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(14.dp),
    ) {
        Image(painterResource(R.drawable.logo), contentDescription = null, modifier = Modifier.size(150.dp))
        Text("Lista Spesa & Menù", fontSize = 28.sp, fontWeight = FontWeight.Bold, color = Palette.Ink)
        Text(
            "Use the same server and household key on both phones. Your name is what your partner sees when you're shopping.",
            fontSize = 15.sp,
            color = Palette.Muted,
            textAlign = TextAlign.Center,
        )
        OutlinedTextField(
            value = who,
            onValueChange = { who = it },
            label = { Text("Your name") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = server,
            onValueChange = { server = it },
            label = { Text("Server") },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri),
            modifier = Modifier.fillMaxWidth(),
        )
        OutlinedTextField(
            value = key,
            onValueChange = { key = it },
            label = { Text("Household key") },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = { onSave(Config(server.trim(), key.trim(), who.trim())) },
            enabled = ready,
            modifier = Modifier.fillMaxWidth().heightIn(min = 52.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(containerColor = Palette.Green, contentColor = Color.White),
        ) { Text("Connect", fontSize = 17.sp, fontWeight = FontWeight.SemiBold) }
        if (onCancel != null) {
            TextButton(onClick = onCancel) { Text("Cancel", color = Palette.Green) }
        }
    }
}
