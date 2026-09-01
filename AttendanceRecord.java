package com.agentforces.attendance;

final class AttendanceRecord {
    String date;
    String attendanceLocalTime;
    String officeName;
    String source;
    String attendedAt;
    String timezone;

    String toJson() {
        return "{" +
                "\"date\":" + Json.q(date) + "," +
                "\"attendanceLocalTime\":" + Json.q(attendanceLocalTime) + "," +
                "\"officeName\":" + Json.q(officeName) + "," +
                "\"source\":" + Json.q(source) + "," +
                "\"attendedAt\":" + Json.q(attendedAt) + "," +
                "\"timezone\":" + Json.q(timezone) +
                "}";
    }
}
