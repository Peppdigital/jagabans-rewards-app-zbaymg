const { withXcodeProject } = require('@expo/config-plugins');

const PHASE_NAME = 'Strip Square SDK';

// Runs at Xcode build time inside the app bundle:
// 1. Removes the unsigned `setup` shell script (ITMS-90035)
// 2. Removes nested Frameworks directories (ITMS-90205 / ITMS-90206)
// 3. Re-signs the cleaned frameworks with the active distribution identity
const STRIP_SCRIPT = `#!/bin/bash
set -e
FRAMEWORKS_DIR="\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}"

strip_square_framework() {
  local FW="\$1"
  [ -d "\$FW" ] || return 0

  # Remove the unsigned helper script Apple rejects
  rm -f "\${FW}/setup"

  # Remove nested Frameworks bundle (disallowed by App Store)
  rm -rf "\${FW}/Frameworks"

  # Re-sign only when a real identity is present (skip simulator / no-sign builds)
  if [ -n "\${EXPANDED_CODE_SIGN_IDENTITY}" ] && [ "\${EXPANDED_CODE_SIGN_IDENTITY}" != "-" ]; then
    codesign --force --sign "\${EXPANDED_CODE_SIGN_IDENTITY}" \\
      --preserve-metadata=identifier,entitlements "\$FW"
  fi
}

strip_square_framework "\${FRAMEWORKS_DIR}/SquareInAppPaymentsSDK.framework"
strip_square_framework "\${FRAMEWORKS_DIR}/SquareBuyerVerificationSDK.framework"
`;

module.exports = function withSquareSDKFix(config) {
  return withXcodeProject(config, (mod) => {
    const project = mod.modResults;

    // Idempotent — skip if already added
    const existingPhases = project.hash.project.objects.PBXShellScriptBuildPhase || {};
    const alreadyAdded = Object.values(existingPhases).some(
      (p) => p && typeof p === 'object' && (p.name === PHASE_NAME || p.name === `"${PHASE_NAME}"`)
    );
    if (alreadyAdded) return mod;

    const phaseUuid = project.generateUuid();

    if (!project.hash.project.objects.PBXShellScriptBuildPhase) {
      project.hash.project.objects.PBXShellScriptBuildPhase = {};
    }

    project.hash.project.objects.PBXShellScriptBuildPhase[phaseUuid] = {
      isa: 'PBXShellScriptBuildPhase',
      buildActionMask: 2147483647,
      files: [],
      inputFileListPaths: [],
      inputPaths: [],
      name: `"${PHASE_NAME}"`,
      outputFileListPaths: [],
      outputPaths: [],
      runOnlyForDeploymentPostprocessing: 0,
      shellPath: '/bin/sh',
      shellScript: JSON.stringify(STRIP_SCRIPT),
    };
    project.hash.project.objects.PBXShellScriptBuildPhase[`${phaseUuid}_comment`] = PHASE_NAME;

    // Attach to the first native target
    const nativeTargets = project.pbxNativeTargetSection();
    const target = Object.values(nativeTargets).find(
      (t) => t && typeof t === 'object' && Array.isArray(t.buildPhases)
    );
    if (target) {
      target.buildPhases.push({ value: phaseUuid, comment: PHASE_NAME });
    }

    return mod;
  });
};
