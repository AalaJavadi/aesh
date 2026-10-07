AESH v3.12 - Direct Route Cache Fix

Upload/replace ALL contents of this folder in the ROOT of the GitHub Pages repository.
Do not upload only index.html.

Important fix:
Direct URLs such as /teacher/<name>/ now revalidate the latest root index.html instead of force-loading an old cached copy.

After commit/deploy, test a direct profile URL once with a cache-busting query, for example:
https://aesh.ir/teacher/امیرعلی-رهنما/?v=312
Then the normal URL should also show the current version after browser/GitHub cache refreshes.
