package com.dhamantaha.app;

import static org.junit.Assert.*;
import android.content.Intent;
import android.provider.CalendarContract;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import java.util.Calendar;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class CalendarIntentTest {
    @Test public void opensUnrestrictedPhoneEditorAtLocalNineWithNoPrivateReceiptData() {
        Intent intent = PhoneCalendarPlugin.eventIntent("2096-03-09", "Dhamantaha · Return deadline");
        assertEquals(Intent.ACTION_INSERT, intent.getAction());
        assertEquals(CalendarContract.Events.CONTENT_URI, intent.getData());
        assertNull(intent.getPackage());
        assertFalse(intent.hasExtra(CalendarContract.Events.DESCRIPTION));
        Calendar start = Calendar.getInstance();
        long begin = intent.getLongExtra(CalendarContract.EXTRA_EVENT_BEGIN_TIME, 0);
        start.setTimeInMillis(begin);
        assertEquals(2096, start.get(Calendar.YEAR));
        assertEquals(Calendar.MARCH, start.get(Calendar.MONTH));
        assertEquals(9, start.get(Calendar.DAY_OF_MONTH));
        assertEquals(9, start.get(Calendar.HOUR_OF_DAY));
        assertEquals(30 * 60 * 1000L, intent.getLongExtra(CalendarContract.EXTRA_EVENT_END_TIME, 0) - begin);
    }

    @Test public void rejectsImpossiblePastAndMalformedDates() {
        for (String date : new String[]{"2096-02-30", "2096-3-09", "2020-01-01", "bad", "3000-01-01"}) {
            try { PhoneCalendarPlugin.eventIntent(date, "Deadline"); fail(date); }
            catch (IllegalArgumentException expected) { }
        }
    }
}
