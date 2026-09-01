package com.agentforces.attendance;

import javax.servlet.*;
import javax.servlet.http.HttpServletResponse;
import java.io.IOException;

public class SecurityHeadersFilter implements Filter {
    public void init(FilterConfig filterConfig) {}
    public void destroy() {}
    public void doFilter(ServletRequest request, ServletResponse response, FilterChain chain) throws IOException, ServletException {
        if (response instanceof HttpServletResponse) {
            HttpServletResponse r = (HttpServletResponse) response;
            r.setHeader("X-Content-Type-Options", "nosniff");
            r.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
            r.setHeader("Permissions-Policy", "geolocation=(), camera=(), microphone=()");
            r.setHeader("X-Frame-Options", "DENY");
        }
        chain.doFilter(request, response);
    }
}
