#!/usr/bin/env python3
"""Rig the supplied eye-fix export without changing its UVs or rest appearance.

Usage: python3 scripts/prepare-metronome.py INPUT.glb OUTPUT.glb
The two eye surfaces and pupils are disconnected islands in body_geo. Extract
those islands (leave the brass rims in the body) so pressing never exposes a
second stationary eye. Rebase the pendulum at its authored mechanical hinge.
The resulting controls are direct root children, in the runtime's model frame.
"""
import copy
import json
from pathlib import Path
import struct
import sys


def prepare(source, target):
    raw = Path(source).read_bytes()
    json_size = struct.unpack_from('<I', raw, 12)[0]
    gltf = json.loads(raw[20:20 + json_size])
    original = copy.deepcopy(gltf)
    binary = raw[28 + json_size:]
    output = bytearray()
    gltf['accessors'] = []
    gltf['bufferViews'] = []
    gltf['meshes'] = []

    def read(index):
        acc = original['accessors'][index]
        view = original['bufferViews'][acc['bufferView']]
        count = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3}[acc['type']]
        fmt = '<' + {5126: 'f', 5123: 'H', 5125: 'I'}[acc['componentType']] * count
        stride = view.get('byteStride', struct.calcsize(fmt))
        start = view.get('byteOffset', 0) + acc.get('byteOffset', 0)
        return [struct.unpack_from(fmt, binary, start + i * stride) for i in range(acc['count'])]

    def write(values, kind, component=5126, bounds=False):
        while len(output) % 4:
            output.append(0)
        offset = len(output)
        fmt = '<' + {5126: 'f', 5123: 'H', 5125: 'I'}[component] * len(values[0])
        for value in values:
            output.extend(struct.pack(fmt, *value))
        view = len(gltf['bufferViews'])
        gltf['bufferViews'].append({'buffer': 0, 'byteOffset': offset, 'byteLength': len(output) - offset})
        acc = {'bufferView': view, 'componentType': component, 'count': len(values), 'type': kind}
        if bounds:
            acc['min'] = [min(v[i] for v in values) for i in range(len(values[0]))]
            acc['max'] = [max(v[i] for v in values) for i in range(len(values[0]))]
        gltf['accessors'].append(acc)
        return len(gltf['accessors']) - 1

    def mesh(primitive, indices, name, center=(0, 0, 0)):
        used = sorted(set(indices))
        remap = {old: new for new, old in enumerate(used)}
        attrs = {}
        for attr, index in primitive['attributes'].items():
            values = read(index)
            selected = [values[i] for i in used]
            if attr == 'POSITION':
                selected = [tuple(v[i] - center[i] for i in range(3)) for v in selected]
            attrs[attr] = write(selected, original['accessors'][index]['type'], bounds=attr == 'POSITION')
        result = {**primitive, 'attributes': attrs, 'indices': write([(remap[i],) for i in indices], 'SCALAR', 5123)}
        gltf['meshes'].append({'name': name, 'primitives': [result]})
        return len(gltf['meshes']) - 1

    group_id = next(i for i, n in enumerate(gltf['nodes']) if n.get('name') == 'metronom_grp')
    group = gltf['nodes'][group_id]
    assert all(abs(s - .01) < 1e-7 for s in group['scale'])
    assert all(abs(a - b) < 1e-6 for a, b in zip(group['rotation'], [2**-.5, 0, 0, 2**-.5]))

    def root_control(name, primitive, indices, center):
        x, y, z = center
        tx, ty, tz = group['translation']
        node = {'name': name, 'mesh': mesh(primitive, indices, name, center),
                'rotation': group['rotation'], 'scale': group['scale'],
                'translation': [tx + x * .01, ty - z * .01, tz + y * .01]}
        index = len(gltf['nodes'])
        gltf['nodes'].append(node)
        gltf['scenes'][gltf.get('scene', 0)]['nodes'].append(index)

    for node_id in list(group['children']):
        node = gltf['nodes'][node_id]
        primitive = original['meshes'][node['mesh']]['primitives'][0]
        indices = [v[0] for v in read(primitive['indices'])]
        if node['name'] == 'body_geo':
            positions = read(primitive['attributes']['POSITION'])
            keys = [tuple(round(x, 4) for x in v) for v in positions]
            parents = {key: key for key in keys}

            def find(key):
                if parents[key] != key:
                    parents[key] = find(parents[key])
                return parents[key]

            for i in range(0, len(indices), 3):
                a, b, c = [find(keys[j]) for j in indices[i:i+3]]
                parents[b] = a
                parents[c] = a
            islands = {}
            for i, key in enumerate(keys):
                islands.setdefault(find(key), []).append(i)
            removed = set()
            for name, sign in [('L_button_geo', -1), ('R_button_geo', 1)]:
                # Enclose only the round eye and its pupil; the wider brass rim
                # extends outside this box and stays fixed on the body.
                chosen = [island for island in islands.values() if all(
                    3.71 < sign * positions[i][0] < 9.48 and
                    15.40 < positions[i][1] < 22.14 and
                    7.31 < positions[i][2] < 13.53 for i in island)]
                assert len(chosen) == 2, f'{name}: expected one eye and one pupil'
                selected = set(i for island in chosen for i in island)
                button_indices = [i for i in indices if i in selected]
                assert len(button_indices) % 3 == 0
                center = [sum((min(positions[i][a] for i in selected), max(positions[i][a] for i in selected))) / 2 for a in range(3)]
                root_control(name, primitive, button_indices, center)
                removed.update(selected)
            remaining = [i for i in indices if i not in removed]
            node['mesh'] = mesh(primitive, remaining, node['name'])
        elif node['name'] == 'pendulum_geo':
            # Mechanical hinge from the original separately pivoted export,
            # expressed in the new export's centimeter-space group coordinates.
            center = (.1310802996, 16.403380036, 8.071010559)
            root_control(node['name'], primitive, indices, center)
            group['children'].remove(node_id)
            # This unreferenced placeholder has no mesh and cannot render.
            node.clear()
            node['name'] = 'pendulum_export_placeholder'
        else:
            node['mesh'] = mesh(primitive, indices, node['name'])

    gltf['buffers'] = [{'byteLength': len(output)}]
    gltf.setdefault('asset', {})['extras'] = {'rig': 'Eyes extracted from eye-fix UVs; root-space pendulum hinge. scripts/prepare-metronome.py'}
    encoded = json.dumps(gltf, separators=(',', ':')).encode()
    encoded += b' ' * (-len(encoded) % 4)
    output.extend(b'\0' * (-len(output) % 4))
    packed = struct.pack('<4sII', b'glTF', 2, 12 + 8 + len(encoded) + 8 + len(output))
    packed += struct.pack('<I4s', len(encoded), b'JSON') + encoded
    packed += struct.pack('<I4s', len(output), b'BIN\0') + output
    Path(target).parent.mkdir(parents=True, exist_ok=True)
    Path(target).write_bytes(packed)
    print(f'Prepared {target}: independent eye buttons and pendulum hinge; original UVs retained.')


if __name__ == '__main__':
    prepare(*sys.argv[1:])
