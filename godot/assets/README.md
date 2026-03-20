# Assets Setup

Sprite sheets and portraits live in the root project (`sheets/` and `portraits/`).
To use them in Godot, create symlinks:

```bash
cd godot/assets/sprites
ln -s ../../../sheets/*_sheet.png .

cd godot/assets/portraits  
ln -s ../../../portraits/*.png .
```
