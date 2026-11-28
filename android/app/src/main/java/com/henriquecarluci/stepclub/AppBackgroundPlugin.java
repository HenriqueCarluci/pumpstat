package com.henriquecarluci.stepclub;

import android.app.ActivityManager;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;

import androidx.core.app.NotificationManagerCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Avisos com o app fechado: mostra se o Android está limitando o PIU Stats em segundo plano
 * (economia de bateria) e abre as telas do sistema para a pessoa liberar. Não pede a permissão
 * REQUEST_IGNORE_BATTERY_OPTIMIZATIONS (restrita pela Play); só leva às configurações.
 */
@CapacitorPlugin(name = "AppBackground")
public class AppBackgroundPlugin extends Plugin {
    @PluginMethod
    public void status(PluginCall call) {
        Context ctx = getContext();
        JSObject r = new JSObject();
        PowerManager pm = (PowerManager) ctx.getSystemService(Context.POWER_SERVICE);
        r.put("batteryFree", pm != null && pm.isIgnoringBatteryOptimizations(ctx.getPackageName()));
        boolean restricted = false;
        if (Build.VERSION.SDK_INT >= 28) {
            ActivityManager am = (ActivityManager) ctx.getSystemService(Context.ACTIVITY_SERVICE);
            restricted = am != null && am.isBackgroundRestricted();
        }
        r.put("restricted", restricted);
        r.put("notifications", NotificationManagerCompat.from(ctx).areNotificationsEnabled());
        r.put("manufacturer", Build.MANUFACTURER);
        call.resolve(r);
    }

    /** Tela "Informações do app" (Bateria → Sem restrições). */
    @PluginMethod
    public void openBattery(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + ctx.getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            try {
                Intent i = new Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS);
                i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                call.resolve();
            } catch (Exception e2) {
                call.reject("Não deu para abrir as configurações do aparelho.");
            }
        }
    }

    /** Configurações de notificação do app (canais Avisos e Fila). */
    @PluginMethod
    public void openNotifications(PluginCall call) {
        Context ctx = getContext();
        try {
            Intent i = new Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS);
            i.putExtra(Settings.EXTRA_APP_PACKAGE, ctx.getPackageName());
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            ctx.startActivity(i);
            call.resolve();
        } catch (Exception e) {
            call.reject("Não deu para abrir as configurações do aparelho.");
        }
    }
}
