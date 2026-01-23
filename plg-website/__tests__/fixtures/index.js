/**
 * PLG Test Fixtures Index
 *
 * Central export point for all test fixtures.
 * Import from here to get consistent test data across all tests.
 *
 * Usage:
 *   import { testUsers, testSubscriptions, testLicenses } from '../fixtures/index.js';
 *   import { createSession, createCheckoutSession } from '../fixtures/index.js';
 */

// User fixtures
export {
  testUsers,
  individualUser,
  enterpriseUser,
  expiredUser,
  cancelledUser,
  newUser,
  enterpriseMember,
  createSession,
  createIndividualSession,
  createEnterpriseSession,
} from "./users.js";

// Subscription fixtures
export {
  testSubscriptions,
  activeMonthly,
  activeAnnual,
  enterpriseSeats,
  pastDue,
  cancelled,
  trialing,
  createCheckoutSession,
  createPortalSession,
} from "./subscriptions.js";

// License fixtures
export {
  testLicenses,
  activeLicense,
  enterpriseLicense,
  atLimitLicense,
  expiredLicense,
  suspendedLicense,
  offlineLicense,
  testMachines,
  activeMachine,
  staleMachine,
  wrapLicenseResponse,
  createValidationResponse,
  wrapMachineResponse,
  createMachineListResponse,
  createCheckoutCertificate,
} from "./licenses.js";
