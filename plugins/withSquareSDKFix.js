/* eslint-disable @typescript-eslint/no-require-imports */
const { withXcodeProject } = require('@expo/config-plugins');
const withSquarePaymentsSDK = require('react-native-square-in-app-payments/app.plugin.js');

const SQUARE_PHASE_NAME = '[CP] Square In-App Payments SDK Setup';
const CLEANUP_MARKER = '# Expo Square App Store cleanup';

// Runs at Xcode build time from Square's own setup phase, after CocoaPods has
// embedded the frameworks:
// 1. Removes the unsigned `setup` shell script (ITMS-90035)
// 2. Removes nested Frameworks directories (ITMS-90205 / ITMS-90206)
// 3. Re-signs the cleaned frameworks individually with the active identity
const CLEANUP_SCRIPT = `
${CLEANUP_MARKER}
SQUARE_FRAMEWORKS_DIR="\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}"

strip_square_framework() {
  local FW="$1"
  [ -d "$FW" ] || return 0

  # Remove the unsigned helper script Apple rejects
  rm -f "\${FW}/setup"

  # Remove nested Frameworks bundle (disallowed by App Store)
  rm -rf "\${FW}/Frameworks"

  # Re-sign only when a real identity is present (skip simulator / no-sign builds)
  if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY}" ] && [ "\${EXPANDED_CODE_SIGN_IDENTITY}" != "-" ]; then
    codesign --force --sign "\${EXPANDED_CODE_SIGN_IDENTITY}" \\
      --preserve-metadata=identifier,entitlements "$FW"
  fi
}

strip_square_framework "\${SQUARE_FRAMEWORKS_DIR}/SquareInAppPaymentsSDK.framework"
strip_square_framework "\${SQUARE_FRAMEWORKS_DIR}/SquareBuyerVerificationSDK.framework"
`;

const normalizeName = (name) => String(name || '').replace(/^"|"$/g, '');

const parseShellScript = (value) => {
  try {
    return JSON.parse(value);
  } catch {
    return String(value || '').replace(/^"|"$/g, '');
  }
};

const withSquareCleanupPhase = (config) =>
  withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const squarePhase = Object.values(phases).find((phase) => {
      if (!phase || typeof phase !== 'object') return false;

      return normalizeName(phase.name) === SQUARE_PHASE_NAME;
    });

    if (!squarePhase || !squarePhase.shellScript) {
      return mod;
    }

    const shellScript = parseShellScript(squarePhase.shellScript);

    if (!shellScript.includes(CLEANUP_MARKER)) {
      squarePhase.shellScript = JSON.stringify(`${shellScript}\n${CLEANUP_SCRIPT}`);
    }

    return mod;
  });

module.exports = function withSquareSDKFix(config, options = {}) {
  const configWithSquare = withSquarePaymentsSDK(config, options);

  return withSquareCleanupPhase(configWithSquare);
};
