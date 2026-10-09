(function (factory) {
  if (typeof define === "function") define(["./core"], factory);
  else if (typeof module !== "undefined")
    module.exports = factory(require("./core"));
})(function (core) {
  "use strict";
  function createService(adapter) {
    function route(body) {
      if (!body || typeof body !== "object" || Array.isArray(body))
        core.fail("INVALID_INPUT", "Request body required.");
      const fields = {
        meta: ["action"],
        search: ["action", "plan"],
        read: ["action", "key"],
      };
      if (
        !Object.prototype.hasOwnProperty.call(fields, body.action) ||
        Object.keys(body).some((k) => !fields[body.action].includes(k))
      )
        core.fail("INVALID_INPUT", "Unsupported action or request field.");
      switch (body.action) {
        case "meta":
          return adapter.meta();
        case "search":
          return adapter.search(core.validatePlan(body.plan));
        case "read":
          core.parseKey(body.key);
          return adapter.read(body.key);
        default:
          core.fail("INVALID_INPUT", "Unsupported action.");
      }
    }
    return { route };
  }
  return { createService };
});
