/* eslint-disable @typescript-eslint/no-require-imports */
const { withXcodeProject } = require('@expo/config-plugins');
const withSquarePaymentsSDK = require('react-native-square-in-app-payments/app.plugin.js');

const PHASE_NAME = 'Strip Square SDK';

// Runs at Xcode build time inside the app bundle, after CocoaPods and Square's
// own setup script have embedded their frameworks:
// 1. Removes the unsigned `setup` shell script (ITMS-90035)
// 2. Removes nested Frameworks directories (ITMS-90205 / ITMS-90206)
// 3. Re-signs the cleaned frameworks with the active distribution identity
const STRIP_SCRIPT = `#!/bin/bash
set -e
FRAMEWORKS_DIR="\${TARGET_BUILD_DIR}/\${FRAMEWORKS_FOLDER_PATH}"

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

strip_square_framework "\${FRAMEWORKS_DIR}/SquareInAppPaymentsSDK.framework"
strip_square_framework "\${FRAMEWORKS_DIR}/SquareBuyerVerificationSDK.framework"
`;

const normalizeName = (name) => String(name || '').replace(/^"|"$/g, '');

const getAppTarget = (project) => {
  const nativeTargets = project.pbxNativeTargetSection();
  const targetUuid = Object.keys(nativeTargets).find((key) => {
    if (key.endsWith('_comment')) return false;

    const target = nativeTargets[key];
    const targetName = normalizeName(target && target.name);

    return target && Array.isArray(target.buildPhases) && targetName !== 'Pods';
  });

  return targetUuid ? { targetUuid, target: nativeTargets[targetUuid] } : null;
};

const findExistingPhaseUuid = (project) => {
  const phases = project.hash.project.objects.PBXShellScriptBuildPhase || {};

  return Object.entries(phases).find(([key, phase]) => {
    if (key.endsWith('_comment') || !phase || typeof phase !== 'object') {
      return false;
    }

    return normalizeName(phase.name) === PHASE_NAME;
  })?.[0];
};

const createPhase = (project) => {
  const phaseUuid = project.generateUuid();
  const phases =
    project.hash.project.objects.PBXShellScriptBuildPhase ||
    (project.hash.project.objects.PBXShellScriptBuildPhase = {});

  phases[phaseUuid] = {
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
  phases[`${phaseUuid}_comment`] = PHASE_NAME;

  return phaseUuid;
};

const withSquareCleanupPhase = (config) =>
  withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const appTarget = getAppTarget(project);

    if (!appTarget) {
      return mod;
    }

    const phaseUuid = findExistingPhaseUuid(project) || createPhase(project);

    // Keep the cleanup idempotent and force it to the very end. Square's own
    // setup phase can be injected by its package plugin after explicit plugins,
    // so order matters for App Store validation.
    appTarget.target.buildPhases = appTarget.target.buildPhases.filter(
      (phase) => phase.value !== phaseUuid
    );
    appTarget.target.buildPhases.push({ value: phaseUuid, comment: PHASE_NAME });

    return mod;
  });

module.exports = function withSquareSDKFix(config, options = {}) {
  const configWithSquare = withSquarePaymentsSDK(config, options);

  return withSquareCleanupPhase(configWithSquare);
};
