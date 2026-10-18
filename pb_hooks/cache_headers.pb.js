/// <reference path="../pb_data/types.d.ts" />

// Make browsers revalidate the HTML entry pages on every visit, so a deploy
// shows up immediately. The CSS and JavaScript they reference carry content
// hashes (see scripts/build-public.mjs) and can keep being cached.
//
// PocketBase runs each handler in an isolated VM, so everything it needs is
// declared inside the function.
routerUse((e) => {
  const htmlPaths = ["/", "/index.html", "/admin.html"];

  if (htmlPaths.includes(e.request.url.path)) {
    e.response.header().set("Cache-Control", "no-cache");
  }

  return e.next();
});
