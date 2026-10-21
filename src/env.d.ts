/// <reference types="astro/client" />

// Types for Astro.locals, set by src/middleware.ts on every request.
declare namespace App {
  interface Locals {
    /** Wired application services for this request (see composition/create-container.ts). */
    app: import('@/composition/create-container').Container;
    /** Unique id for this request, used to correlate logs. */
    requestId: string;
    /** The signed-in admin, or null. Set from the session cookie on every request. */
    admin: import('@/application/ports/identity').AdminUser | null;
  }
}
