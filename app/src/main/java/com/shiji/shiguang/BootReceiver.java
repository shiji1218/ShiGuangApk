package com.shiji.shiguang;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** 开机重启后恢复每日提醒 */
public class BootReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context ctx, Intent intent) {
        if (Intent.ACTION_BOOT_COMPLETED.equals(intent.getAction())) {
            ReminderScheduler.restore(ctx);
        }
    }
}
