// plugins/withSquarePods.js
const { withDangerousMod } = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

module.exports = function withSquarePods(config) {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const podfile = path.join(config.modRequest.platformProjectRoot, "Podfile");
      let contents = fs.readFileSync(podfile, "utf8");

      contents = contents.replace(
        /pod ['"]SquareInAppPaymentsSDK['"].*/g,
        'pod "SquareInAppPaymentsSDK", "1.6.5"'
      );

      contents = contents.replace(
        /pod ['"]SquareBuyerVerificationSDK['"].*/g,
        'pod "SquareBuyerVerificationSDK", "1.6.5"'
      );

      fs.writeFileSync(podfile, contents);
      return config;
    },
  ]);
};