"use strict";
/**
 * Firebase Cloud Functions Index
 *
 * Exports all Cloud Functions for deployment.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.planLayout = exports.generatePdf = exports.stripeWebhook = exports.createCustomerPortalSession = exports.createCheckoutSession = void 0;
const admin = __importStar(require("firebase-admin"));
// Initialize Firebase Admin
admin.initializeApp();
// Export Cloud Functions
var createCheckoutSession_1 = require("./createCheckoutSession");
Object.defineProperty(exports, "createCheckoutSession", { enumerable: true, get: function () { return createCheckoutSession_1.createCheckoutSession; } });
var createCustomerPortalSession_1 = require("./createCustomerPortalSession");
Object.defineProperty(exports, "createCustomerPortalSession", { enumerable: true, get: function () { return createCustomerPortalSession_1.createCustomerPortalSession; } });
var stripeWebhook_1 = require("./stripeWebhook");
Object.defineProperty(exports, "stripeWebhook", { enumerable: true, get: function () { return stripeWebhook_1.stripeWebhook; } });
var generatePdf_1 = require("./generatePdf");
Object.defineProperty(exports, "generatePdf", { enumerable: true, get: function () { return generatePdf_1.generatePdf; } });
var planLayout_1 = require("./planLayout");
Object.defineProperty(exports, "planLayout", { enumerable: true, get: function () { return planLayout_1.planLayout; } });
//# sourceMappingURL=index.js.map