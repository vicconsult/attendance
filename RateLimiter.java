package com.agentforces.attendance;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.concurrent.ConcurrentHashMap;

final class RateLimiter {
    private static final ConcurrentHashMap<String, Deque<Long>> EVENTS = new ConcurrentHashMap<String, Deque<Long>>();
    private RateLimiter() {}

    static boolean allow(String key, int max, long windowMillis) {
        long now = System.currentTimeMillis();
        Deque<Long> deque = EVENTS.computeIfAbsent(key, k -> new ArrayDeque<Long>());
        synchronized (deque) {
            while (!deque.isEmpty() && now - deque.peekFirst() > windowMillis) deque.removeFirst();
            if (deque.size() >= max) return false;
            deque.addLast(now);
            return true;
        }
    }
}
