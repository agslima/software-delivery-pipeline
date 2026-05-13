# Reproducibility Pilot Summary

- Image: `app-stayhealthy-backend`
- Status: `mismatch`
- Comparison basis: `oci_manifest_digest`
- First manifest digest: `sha256:897c6e3b98f0b63e5930a2f9d09ffbffff5425b44973072f0e43aa9225a61989`
- Second manifest digest: `sha256:84b4c840316058d1a641d01dcf571e7abfe8a2ca3cfb3256bd53e76fe9debe75`
- First config digest: `sha256:af42e7e1caf239a8ac31dd4ce21513b83772b63372a3e6b3cce52c3961d47ea2`
- Second config digest: `sha256:7f2a33e739a7ff22999f5b1288873dd38a496ae8e855486951d7305a420e736b`
- First layer count: `9`
- Second layer count: `9`
- First platform: `linux/amd64`
- Second platform: `linux/amd64`

Detailed comparison:
- Config digest match: `False`
- Layer count match: `True`
- Layer digests match: `False`
- Layer digest differences: `3`
- Layer file diff sections: `3`
- Config JSON field differences: `3`

Layer digest differences:
- Layer `5`: first `sha256:6e9103e5aafe1d35600ced5ac4fc782f6d5aeecc323cd98bd6627edfc3927dfb`, second `sha256:3ab7a2d32e828227c315b10dd8e2f27012623e9fb15d339e48a12ac28c38ee49`
- Layer `6`: first `sha256:b25e32e2d1a4f9c41116e6216c3bf1af328aacf1d0fba40d10f89b807c2a5fa2`, second `sha256:48fdcad82085ad00fba4ff6e5a2a3f0fdbdcf653a7a6afd73804e401677594e8`
- Layer `7`: first `sha256:b7be47d894cb67680a296bd4bff98b215c7d75723e2a8531aef76414cfc0c999`, second `sha256:5c32a99837e577effaf18f02e73db9cd0e1874c00a995c75b5cc02e79dc0fc18`

Layer file differences:
- Layer `5` file differences: `9`
  - `etc`: `changed`
  - `etc/apk`: `changed`
  - `etc/apk/world`: `changed`
  - `lib/apk/db`: `changed`
  - `lib/apk/db/installed`: `changed`
  - `lib/apk/db/scripts.tar.gz`: `changed`
  - `lib/apk/db/triggers`: `changed`
  - `sbin`: `changed`
  - `var/log/apk.log`: `changed`
- Layer `6` file differences: `542`
  - `root`: `changed`
  - `root/.npm`: `changed`
  - `root/.npm/_logs`: `changed`
  - `root/.npm/_logs/2026-05-09T02_27_16_612Z-debug-0.log`: `removed`
  - `root/.npm/_logs/2026-05-09T02_27_23_676Z-debug-0.log`: `added`
  - `root/.npm/_update-notifier-last-checked`: `changed`
  - `tmp`: `changed`
  - `tmp/node-compile-cache`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/00bf0630`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/00e7fb07`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/01c08d40`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/0275a71a`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/027fd99b`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/029c3683`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/03bfe4fd`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/04e65cde`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/052c232d`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/0535d717`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/053fed39`: `changed`
  - `tmp/node-compile-cache/v25.9.0-x64-392347a2-0/0555bc32`: `changed`
- ...and `5905` more layer file differences in `report.json`

Config JSON field differences:
- `rootfs.diff_ids[5]`: first `sha256:d5d4995ecb0f2d39a23c16584c4e9c502e04bb680e3c71c6c6b8a76050e389c3`, second `sha256:c4a1d23f8e6098deb404b9553f3e565214edaf54b06cf1250796f95a675843c4`
- `rootfs.diff_ids[6]`: first `sha256:269a1d3f470636788edae2d5867d8f1f05074d399bf1a0d5ca1b525a356e9ef6`, second `sha256:76960abaf27326a36f8bb51871ed9329a5bcdefa5b8ba3ec9c7d822bbdb25d0f`
- `rootfs.diff_ids[7]`: first `sha256:907a36b94f7f75a383a735af637b422f27ca96a161156d7f8bb7d3f2546c9e0a`, second `sha256:97d9834a9ee3261ce4c13f6d0ee3dc80e6dbbfc14a4043393b279f5a2d830691`

Interpretation:
- The two normalized OCI builds produced different manifest digests. Treat this as a reproducibility pilot failure that needs investigation before using the result as evidence.

Artifacts:
- `report.json`
- `summary.md`
