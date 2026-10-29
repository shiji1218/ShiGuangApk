package com.shiji.shiguang;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class ReminderReceiver extends BroadcastReceiver {

    private static final String CHANNEL = "reminder";
    private static final int NOTIFY_ID = 1001;

    @Override
    public void onReceive(Context ctx, Intent intent) {
        NotificationManager nm =
                (NotificationManager) ctx.getSystemService(Context.NOTIFICATION_SERVICE);
        if (nm == null) return;

        if (Build.VERSION.SDK_INT >= 26) {
            nm.createNotificationChannel(new NotificationChannel(
                    CHANNEL, "每日写作提醒", NotificationManager.IMPORTANCE_DEFAULT));
        }

        Intent open = new Intent(ctx, MainActivity.class);
        PendingIntent pi = PendingIntent.getActivity(ctx, 0, open,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification.Builder b = Build.VERSION.SDK_INT >= 26
                ? new Notification.Builder(ctx, CHANNEL)
                : new Notification.Builder(ctx);
        b.setSmallIcon(android.R.drawable.ic_menu_my_calendar)
                .setContentTitle("拾光手账")
                .setContentText("今天的手账还没写哦 ✍️")
                .setAutoCancel(true)
                .setContentIntent(pi);
        nm.notify(NOTIFY_ID, b.build());
    }
}
