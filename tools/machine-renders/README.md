# CNC 3018 renders for the PCB wizard

The pictures on the Blank, Work zero, Height map and Run steps
(`src/app/src/features/PcbWizard/assets/machine-*.webp`) are rendered in Autodesk Fusion
from a model of a CNC 3018 Plus built by these scripts.

- `build3018.py` builds the machine in the active, unsaved *Untitled* Fusion design
  (direct modelling, mm): base and Y axis, gantry, X carriage, Z slide with the 775 spindle,
  bed with a copper-clad blank. Each moving assembly is its own component.
- `scene3018.py` moves the axes to a machine position, adds the props of each wizard scene
  (board outlines, X0 Y0 arrows, probe clips and wires, height map points, milled boards,
  spare bits), checks for collisions and starts Fusion's local renderer.

Run them from a Fusion script (or the Fusion MCP), with this folder on `sys.path`:

```python
import build3018, scene3018
build3018.run('')
print(scene3018.interference([(x, y, z) for x in (0, 150, 300) for y in (0, 90, 180) for z in (0, -45)]))
cam = scene3018.SCENES['zero_z']()
scene3018.render(r'C:\path\to\zero-z.png', cam, 1400, 900, 75)
```

The PNGs are then cropped to their content and saved as WebP (about 1050 px wide) in the assets folder.
