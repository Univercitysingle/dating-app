# Verification and Trust Specification
Last reviewed: 2026-11-07.

The existing PHOTO_VERIFICATION guide describes consent-based selfie video, encrypted evidence and manual superadmin review. It does not claim automated face recognition or certified liveness.

Requirements: explain purpose/access/retention before consent; record consent version/time; encrypt evidence; keep evidence out of public CDN and analytics; restrict and audit reviewer access; support approve/reject/retry; delete on decision or approved retention; document backup/log handling.

Define verified badge meaning, impersonation handling, appeals and safety escalation. A badge must not imply guarantees beyond the actual method.

Review biometric/privacy law and age/jurisdiction rules before launch. Any automated provider requires accuracy, spoof/false-rejection handling and legal/privacy assessment.
