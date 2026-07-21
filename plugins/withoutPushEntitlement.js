// SmileStock is local-notification-only (no backend, no remote push).
// expo-notifications' config plugin unconditionally adds the
// "Push Notifications" (aps-environment) entitlement, which free/personal
// Apple ID accounts cannot sign. Strip it after other plugins run.
const { withEntitlementsPlist } = require('@expo/config-plugins');

module.exports = function withoutPushEntitlement(config) {
  return withEntitlementsPlist(config, (config) => {
    delete config.modResults['aps-environment'];
    return config;
  });
};
