package com.shiji.shiguang;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

/** 每日写作提醒：AlarmManager 每日重复触发 */
public final class ReminderScheduler {

    private static final String PREFS = "shiguang";
    private static final int REQUEST_CODE = 2001;

    private ReminderScheduler() {}

    public static void set(Context ctx, int hour, int minute) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am == null) return;
        java.util.Calendar cal = java.util.Calendar.getInstance();
        cal.set(java.util.Calendar.HOUR_OF_DAY, hour);
        cal.set(java.util.Calendar.MINUTE, minute);
        cal.set(java.util.Calendar.SECOND, 0);
        if (cal.getTimeInMillis() <= System.currentTimeMillis()) {
            cal.add(java.util.Calendar.DAY_OF_YEAR, 1);
        }
        am.setRepeating(AlarmManager.RTC_WAKEUP, cal.getTimeInMillis(),
                AlarmManager.INTERVAL_DAY, pending(ctx));
        prefs(ctx).edit()
                .putBoolean("remEnabled", true)
                .putInt("remHour", hour)
                .putInt("remMinute", minute)
                .apply();
    }

    public static void cancel(Context ctx) {
        AlarmManager am = (AlarmManager) ctx.getSystemService(Context.ALARM_SERVICE);
        if (am != null) am.cancel(pending(ctx));
        prefs(ctx).edit().putBoolean("remEnabled", false).apply();
    }

    /** 开机后由 BootReceiver 调用恢复 */
    public static void restore(Context ctx) {
        SharedPreferences sp = prefs(ctx);
        if (!sp.getBoolean("remEnabled", false)) return;
        set(ctx, sp.getInt("remHour", 20), sp.getInt("remMinute", 0));
    }

    private static PendingIntent pending(Context ctx) {
        Intent i = new Intent(ctx, ReminderReceiver.class);
        return PendingIntent.getBroadcast(ctx, REQUEST_CODE, i,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static SharedPreferences prefs(Context ctx) {
        return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }
}
