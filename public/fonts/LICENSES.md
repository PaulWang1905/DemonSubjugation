# Bundled pixel fonts

The player's "Pixel ·" text choices use these fonts, converted by
`scripts/fonts/build_fonts.py` into the device's 16-pixel HZK16 / ASC16
layout (`cjk16.bin`: GB2312 characters, 16×16; `latin16.bin`: ASCII, 8×16).
The converted files are Modified Versions under the SIL Open Font License 1.1
and are distributed under that same licence. Credits and full licence texts:

| Choice | Files | Made from | Licence |
| --- | --- | --- | --- |
| Retro 8-bit (粗体) | `retro/` | Letters: Press Start 2P by CodeMan38 (Reserved Font Name "Press Start 2P", so the converted font is not called that). Chinese: Ark Pixel 12 px (below), centred and made bold | [PressStart2P-OFL.txt](licenses/PressStart2P-OFL.txt), [ArkPixel-OFL.txt](licenses/ArkPixel-OFL.txt) |
| Ark Pixel (黑体) | `ark/` | Ark Pixel Font 12 px (2026.10.25), © 2021 TakWolf (https://github.com/TakWolf/ark-pixel-font), drawn centred in the 16 px cells; Chinese characters it lacks come from Cubic 11, then Boutique Bitmap 7×7 | [ArkPixel-OFL.txt](licenses/ArkPixel-OFL.txt) |
| Unifont | `unifont/` | GNU Unifont 18.0.01 by Roman Czyborra, Paul Hardy and contributors (https://unifoundry.com/unifont/) | [Unifont-OFL-1.1.txt](licenses/Unifont-OFL-1.1.txt) (Unifont is dual-licensed; see [Unifont-COPYING.txt](licenses/Unifont-COPYING.txt)) |
| Cubic 11 | `cubic/` | Cubic 11 (俐方體11號) 1.451, © 2022-2025 ACh and the Cubic 11 Project Authors (https://github.com/ACh-K/Cubic-11), based on JF Dot M+H 12 and the M+ bitmap fonts; characters it lacks come from Unifont | [Cubic11-OFL.txt](licenses/Cubic11-OFL.txt) |

## More text (12 and 10 pixels)

`small/` holds fonts drawn for the smaller text cells, used by every Pixel
choice when More text is on (`cjk12.bin` / `cjk10.bin`: GB2312, 12 or 10 rows
of 2 bytes; `latin12.bin` / `latin10.bin`: ASCII, 12 or 10 rows of 1 byte).

| Size | Chinese | Letters |
| --- | --- | --- |
| 12 px | Cubic 11 (above) | X11 misc-fixed 6x12 |
| 10 px | Boutique Bitmap 9×9 1.93, © 2020-2026 Cen-cyun Liu (Luke Liu), 字言字型 / fancy type foundry (https://github.com/scott0107000/BoutiqueBitmap9x9) | X11 misc-fixed 5x8, with . , : ; from 5x7 |

Chinese characters these lack come from Boutique Bitmap 7×7 1.71 (same
author). Licences: [BoutiqueBitmap9x9-OFL.txt](licenses/BoutiqueBitmap9x9-OFL.txt),
[BoutiqueBitmap7x7-OFL.txt](licenses/BoutiqueBitmap7x7-OFL.txt) (SIL OFL 1.1),
[X11-misc-fixed-COPYING.txt](licenses/X11-misc-fixed-COPYING.txt) (public
domain, from X.Org font-misc-misc 1.1.3).
