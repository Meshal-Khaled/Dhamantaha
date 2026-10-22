package com.dhamantaha.app;

import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.provider.CalendarContract;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.text.SimpleDateFormat;
import java.text.ParseException;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/** Opens the phone's calendar editor; saving and reminders stay under the user's control. */
@CapacitorPlugin(name = "PhoneCalendar")
public class PhoneCalendarPlugin extends Plugin {
    static Intent eventIntent(String value, String title) {
        if (value == null || !value.matches("[0-9]{4}-[0-9]{2}-[0-9]{2}") || title == null || title.trim().isEmpty() || title.length() > 160) throw new IllegalArgumentException();
        SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd", Locale.US);
        format.setLenient(false);
        final Date parsed;
        try { parsed = format.parse(value); } catch (ParseException error) { throw new IllegalArgumentException(); }
        if (parsed == null || !format.format(parsed).equals(value)) throw new IllegalArgumentException();
        Calendar day = Calendar.getInstance();
        day.setTime(parsed);
        Calendar today = Calendar.getInstance();
        today.set(Calendar.HOUR_OF_DAY, 0); today.set(Calendar.MINUTE, 0); today.set(Calendar.SECOND, 0); today.set(Calendar.MILLISECOND, 0);
        if (day.before(today) || day.get(Calendar.YEAR) > 2999) throw new IllegalArgumentException();
        day.set(Calendar.HOUR_OF_DAY, 9);
        long begin = day.getTimeInMillis();
        return new Intent(Intent.ACTION_INSERT).setData(CalendarContract.Events.CONTENT_URI)
            .putExtra(CalendarContract.Events.TITLE, title.trim())
            .putExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, begin)
            .putExtra(CalendarContract.EXTRA_EVENT_END_TIME, begin + 30 * 60 * 1000L);
    }

    @PluginMethod public void openEvent(PluginCall call) {
        final Intent intent;
        final String title = call.getString("title", "Dhamantaha");
        try {
            intent = eventIntent(call.getString("date", ""), title);
        } catch (RuntimeException error) {
            call.reject("Choose a valid upcoming deadline.", "INVALID_DATE");
            return;
        }
        getActivity().runOnUiThread(() -> {
            // A timed event at 09:00 local avoids all-day UTC date shifts across calendar apps.
            try {
                getActivity().startActivity(intent);
                JSObject result = new JSObject();
                result.put("opened", true); // Opening an editor does not prove an event was saved.
                call.resolve(result);
            } catch (ActivityNotFoundException error) {
                call.reject("No calendar app is available to add this event.", "NO_CALENDAR");
            } catch (RuntimeException error) {
                call.reject("Could not open the phone calendar.", "CALENDAR_FAILED");
            }
        });
    }
}
