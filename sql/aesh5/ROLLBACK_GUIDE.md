# AESH 5.0 correction — safe TEST rollback

1. Preserve a snapshot **before** trying migrations in an isolated test project. This package neither deletes nor rewrites legacy user records, existing work images, or old HTML.
2. If TEST results fail, stop new image uploads; restore the previous **TEST** site commit. Keep the work buckets private while investigating privacy. Do **not** restore a public work bucket blindly: doing so can reveal pending images again.
3. The `004_private_work_media.sql` privacy migration changes the **public flag** of the three work buckets from their pre-existing state (which is unknown). Record actual flags before applying it. Existing published media should be served by the `aesh-approved-media` Edge Function; check it before applying 004.
4. To undo the work-image gateway, first restore a reviewed alternative that protects pending files. Do not drop restrictive Storage policies while existing pending objects remain in a publicly accessible bucket.
5. The `002_storage_limits.sql` migration retains original images and sets future upload limits. To restore old limits, use the values captured in your test backup. Directory uploads are now INSERT-only and use a new UUID per photo; they never overwrite an old image.
6. New SQL functions/tables are additive. Do not drop them until any TEST data is exported and explicit operator approval is recorded.
7. No rollback is performed on Production because no migration is being executed there. Original `aesh(1).zip`, old TEST and PRODUCTION archives should remain untouched for comparison.
