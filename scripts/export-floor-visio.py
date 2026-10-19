import argparse
import hashlib
import os
import re
import socket
import subprocess
import tempfile
import time
from pathlib import Path

import uno
from com.sun.star.beans import PropertyValue
from PIL import Image, ImageChops, ImageFilter


def prop(name, value):
    value_property = PropertyValue()
    value_property.Name, value_property.Value = name, value
    return value_property


LEGACY_SOURCE = '08127bff3e08dfea6ea8af72c3859a2c861a6e2c999780d80f126424a53b3d27'
LEGACY_IMAGES = {
    1: '81a16cafb3b026ff76e48ec6f4484c0c952e08591d5d833d4153aa1f9eb9c083',
    2: '1cfb037e937e9bb1fdc8900ff995bc8aad78bfc6a9e3974a51ca665a84b74678',
    3: 'f40193ed629d830697305a2277c4a93f390c7a6bf23940f14f2e76aaa8210b89',
    4: '622e921b122a81439aff3ee58d293b90df30581c1ba9a17b2e243a73ecc303b5',
    5: 'f1e315aa61723c5b8960740ced3b4713a52373fc7005635640081dd82b5d9466',
    6: '4d92e969ebb4fb3cd36f68a8198b61e85b0bee7e3c45cd9aaa4790810fb232e0',
    7: '0f251f9d835ee4558747136bd19b3c22d7138becb60ccd1f43ebffff81746356',
    8: '62e768eface9bbbcd9f6508bdc9702096c153857b320cbb478b08b6e4cb76e93',
    9: '321a99dd047a9229daff00665bf01284250ffd2598474f8aaacf9f1d55d1837f',
    10: 'ee5986b15b56416d2a9d88dbfb05203c2391adca1760397baf9ef837d5741cf8',
    11: '45896a886b1d6c75b208659c0d5d70d9b90bb5b11dd443944670cddacfa9fe8c',
    12: 'a59d8678572a3b1504ac608cc27bd44087ac7e3987003f0077d5585403d88781',
    13: 'cce666da28aa47190928870857bc696b1641485f57d3f4c914e5cff2110bb70f',
    14: 'e59e493eddca05bebad0173089cd4c6e8a943dbe29ffb9b99ae497d624330a5d',
    15: '2d8760ab7d4740fce2061382f75653e172fbabcab17997d0b3a5cdea16384444',
    16: 'aebaccdd3f59236861f650f4664dc6f478382ee525c4cf61d5ea5d422212ff6c',
    17: 'ff1ba7b5cb6b0859676776f3b9390a148758b5957d3f6ea2bbe66e06dfea965e',
    18: 'cd1b7fd91fa6711c736b5f25ef3234129061394d4ae3b9273b09d7f992057ec1',
}


def file_hash(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def recover_antenna(svg, reference, number, view_box):
    image = Image.open(reference).convert('RGB')
    area = (1464, 1780, 1708, 2305) if number == 1 else (229, 0, 408, 400)
    x0, y0, x1, y1 = area
    pixels = image.load()
    segments = []
    for y in range(y0, y1):
        start = None
        for x in range(x0, x1 + 1):
            inside = number != 6 or abs(x - 318) <= max(5, (y - 48) * .31 + 5)
            dark = x < x1 and inside and max(pixels[x, y]) < 145
            if dark and start is None:
                start = x
            if not dark and start is not None:
                length = x - start
                segments.append('M%d %dh%dv1h-%dz' % (start, y, length, length))
                start = None
    left, top, width, height = view_box
    path = '<g transform="translate(%f,%f) scale(%f,%f)"><path fill="#222" d="%s"/></g>' % (
        left, top, width / image.width, height / image.height, ' '.join(segments)
    )
    return svg.replace('</svg>', path + '</svg>')


def recover_details(svg, reference, view_box, temporary, number):
    original = Image.open(reference).convert('RGB')
    raster_svg = Path(temporary) / ('comparison-%d.svg' % number)
    raster_png = Path(temporary) / ('comparison-%d.png' % number)
    display = svg.replace('<svg ', '<svg preserveAspectRatio="none" ', 1)
    display = re.sub(
        r'width="[^"]+" height="[^"]+" viewBox=',
        'width="%d" height="%d" viewBox=' % original.size,
        display,
        count=1,
    )
    raster_svg.write_text(display, encoding='utf-8')
    subprocess.run(
        ['magick', '-background', 'white', str(raster_svg), str(raster_png)],
        check=True,
        timeout=60,
    )
    rendered = Image.open(raster_png).convert('L')
    if rendered.size != original.size:
        raise RuntimeError('Ukuran perbandingan halaman %d tidak cocok' % number)
    source_mask = original.convert('L').point(lambda value: 255 if value < 125 else 0)
    vector_mask = rendered.point(lambda value: 255 if value < 190 else 0).filter(
        ImageFilter.MaxFilter(7)
    )
    missing = ImageChops.subtract(source_mask, vector_mask)
    pixels = missing.load()
    segments = []
    for y in range(missing.height):
        start = None
        for x in range(missing.width + 1):
            dark = x < missing.width and pixels[x, y] > 0
            if dark and start is None:
                start = x
            if not dark and start is not None:
                length = x - start
                segments.append('M%d %dh%dv1h-%dz' % (start, y, length, length))
                start = None
    if not segments:
        return svg
    left, top, width, height = view_box
    path = '<g transform="translate(%f,%f) scale(%f,%f)"><path fill="#222" d="%s"/></g>' % (
        left, top, width / original.width, height / original.height, ' '.join(segments)
    )
    return svg.replace('</svg>', path + '</svg>')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('source')
    parser.add_argument('destination')
    args = parser.parse_args()
    destination = Path(args.destination).resolve()
    source = Path(args.source).resolve()
    legacy_source = file_hash(source) == LEGACY_SOURCE
    with socket.socket() as sock:
        sock.bind(('127.0.0.1', 0))
        port = sock.getsockname()[1]
    with tempfile.TemporaryDirectory(prefix='ism-visio-') as temporary:
        profile = Path(temporary) / 'profile'
        process = subprocess.Popen(
            [
                'libreoffice',
                '-env:UserInstallation=' + profile.as_uri(),
                '--headless',
                '--accept=socket,host=127.0.0.1,port=%d;urp;StarOffice.ServiceManager' % port,
                '--norestore',
                '--nodefault',
                '--nofirststartwizard',
            ],
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        document = None
        try:
            context = uno.getComponentContext()
            resolver = context.ServiceManager.createInstanceWithContext(
                'com.sun.star.bridge.UnoUrlResolver', context
            )
            for _ in range(120):
                try:
                    remote = resolver.resolve(
                        'uno:socket,host=127.0.0.1,port=%d;urp;StarOffice.ComponentContext' % port
                    )
                    break
                except Exception:
                    if process.poll() is not None:
                        raise RuntimeError('LibreOffice tidak dapat dijalankan')
                    time.sleep(.5)
            else:
                raise RuntimeError('LibreOffice tidak merespons')
            manager = remote.ServiceManager
            desktop = manager.createInstanceWithContext('com.sun.star.frame.Desktop', remote)
            document = desktop.loadComponentFromURL(
                source.as_uri(), '_blank', 0, (prop('Hidden', True), prop('ReadOnly', True))
            )
            if document is None:
                raise RuntimeError('Visio tidak dapat dibuka')
            pages = document.getDrawPages()
            destination.mkdir(parents=True, exist_ok=True)
            for index in range(pages.getCount()):
                number = index + 1
                reference = destination / ('page-%d.png' % number)
                if not reference.exists():
                    print('Halaman %d dilewati: PNG referensi tidak ada' % number, flush=True)
                    continue
                exported = Path(temporary) / ('page-%d.svg' % number)
                rendered = Path(temporary) / ('page-%d.png' % number)
                exporter = manager.createInstanceWithContext(
                    'com.sun.star.drawing.GraphicExportFilter', remote
                )
                exporter.setSourceDocument(pages.getByIndex(index))
                if not exporter.filter(
                    (prop('MediaType', 'image/svg+xml'), prop('URL', exported.as_uri()))
                ):
                    raise RuntimeError('Gagal mengekspor halaman %d' % number)
                subprocess.run(
                    ['magick', '-background', 'white', '-density', '50', str(exported), str(rendered)],
                    check=True,
                    timeout=60,
                )
                image = Image.open(rendered).convert('RGB')
                mask = ImageChops.difference(
                    image, Image.new('RGB', image.size, 'white')
                ).convert('L').point(lambda value: 255 if value > 20 else 0)
                bounds = mask.getbbox()
                ref = Image.open(reference)
                if not bounds:
                    print('Halaman %d dilewati: denah kosong' % number, flush=True)
                    continue
                ratio = ref.width / ref.height
                recover = (
                    legacy_source
                    and number in LEGACY_IMAGES
                    and file_hash(reference) == LEGACY_IMAGES[number]
                )
                actual = (bounds[2] - bounds[0]) / (bounds[3] - bounds[1])
                if abs(actual / ratio - 1) > .06 and not (recover and number == 6):
                    print('Halaman %d dilewati: batas Visio berbeda dari PNG' % number, flush=True)
                    continue
                svg = exported.read_text(encoding='utf-8')
                match = re.search(r'viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"', svg)
                if not match:
                    raise RuntimeError('viewBox tidak ditemukan pada halaman %d' % number)
                vx, vy, vw, vh = map(float, match.groups())
                left = vx + bounds[0] * vw / image.width
                top = vy + bounds[1] * vh / image.height
                width = (bounds[2] - bounds[0]) * vw / image.width
                height = (bounds[3] - bounds[1]) * vh / image.height
                if recover and number == 6:
                    top -= 56 * width / ref.width
                    height = width / ratio
                elif width / height < ratio:
                    expanded = height * ratio
                    left -= (expanded - width) / 2
                    width = expanded
                else:
                    expanded = width / ratio
                    top -= (expanded - height) / 2
                    height = expanded
                view_box = 'viewBox="%.2f %.2f %.2f %.2f"' % (left, top, width, height)
                svg = svg[:match.start()] + view_box + svg[match.end():]
                if recover and number in (1, 6):
                    svg = recover_antenna(svg, reference, number, (left, top, width, height))
                elif recover:
                    svg = recover_details(svg, reference, (left, top, width, height), temporary, number)
                target = destination / ('page-%d.svg' % number)
                staging = destination / ('.page-%d.svg.tmp' % number)
                staging.write_text(svg, encoding='utf-8')
                staging.chmod(0o600)
                os.replace(staging, target)
                print('Halaman %d: %s' % (number, pages.getByIndex(index).getName()), flush=True)
        finally:
            if document:
                document.close(True)
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()


if __name__ == '__main__':
    main()
