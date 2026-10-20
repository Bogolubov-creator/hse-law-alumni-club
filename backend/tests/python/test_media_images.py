import io

import pytest
from PIL import Image

from club_api.core.errors import ApiError
from club_api.modules.media.service import render_thumbnail


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP", "GIF"])
def test_thumbnail_preserves_shape_and_returns_clean_png(format):
    source = io.BytesIO()
    Image.new("RGB", (400, 200), (30, 60, 90)).save(source, format=format)
    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.format == "PNG"
        assert result.size == (256, 128)
        assert not result.getexif()


def test_thumbnail_preserves_transparency():
    source = io.BytesIO()
    Image.new("RGBA", (400, 200), (30, 60, 90, 100)).save(source, format="PNG")
    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.mode == "RGBA"
        assert result.getpixel((128, 64))[3] == 100


def test_thumbnail_applies_orientation_without_preserving_metadata():
    source = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6
    Image.new("RGB", (400, 200)).save(source, format="JPEG", exif=exif)
    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.size == (128, 256)
        assert not result.getexif()


def test_thumbnail_rejects_corrupted_image():
    with pytest.raises(ApiError, match="изображение"):
        render_thumbnail(b"\x89PNG\r\n\x1a\ninvalid-image")
