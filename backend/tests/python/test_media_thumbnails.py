import io

import pytest
from PIL import Image

from club_api.core.errors import ApiError
from club_api.modules.media.service import render_thumbnail


@pytest.mark.parametrize("format", ["JPEG", "PNG", "WEBP", "GIF", "AVIF"])
def test_thumbnail_decodes_supported_images_and_limits_size(format):
    source = io.BytesIO()
    Image.new("RGB", (600, 300), "red").save(source, format=format)

    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.format == "PNG"
        assert result.size == (256, 128)
        assert result.mode == "RGB"
        assert result.getpixel((128, 64))[0] > 200


def test_thumbnail_applies_orientation_and_discards_metadata():
    source = io.BytesIO()
    exif = Image.Exif()
    exif[274] = 6
    exif[315] = "synthetic-private-author"
    Image.new("RGB", (600, 300), "blue").save(source, format="JPEG", exif=exif)

    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.size == (128, 256)
        assert not result.getexif()
        assert "exif" not in result.info
        assert "icc_profile" not in result.info


def test_thumbnail_preserves_alpha():
    source = io.BytesIO()
    Image.new("RGBA", (20, 10), (10, 20, 30, 0)).save(source, format="PNG")

    with Image.open(io.BytesIO(render_thumbnail(source.getvalue()))) as result:
        assert result.size == (20, 10)
        assert result.mode == "RGBA"
        assert result.getpixel((0, 0))[3] == 0


@pytest.mark.parametrize("data", [b"not an image", b"\xff\xd8\xff" + bytes(30), b"\x89PNG\r\n\x1a\n" + bytes(30)])
def test_thumbnail_rejects_invalid_images(data):
    with pytest.raises(ApiError) as error:
        render_thumbnail(data)
    assert error.value.status == 415


def test_thumbnail_rejects_excessive_dimensions():
    source = io.BytesIO()
    Image.new("1", (4001, 4000)).save(source, format="PNG")

    with pytest.raises(ApiError) as error:
        render_thumbnail(source.getvalue())
    assert error.value.status == 415
