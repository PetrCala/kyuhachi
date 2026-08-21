import { downscalePhoto, PHOTO_MAX_EDGE, PHOTO_QUALITY } from '@/lib/downscale-photo';

// `mock`-prefixed so jest.mock's factory, which is hoisted above these, is
// allowed to close over them.
const mockResize = jest.fn();
const mockRenderAsync = jest.fn();
const mockSaveAsync = jest.fn();
const mockManipulate = jest.fn();

jest.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: (uri: string) => mockManipulate(uri) },
  SaveFormat: { JPEG: 'jpeg' },
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockSaveAsync.mockResolvedValue({ uri: 'file://scaled.jpg', width: 0, height: 0 });
  mockRenderAsync.mockResolvedValue({ saveAsync: mockSaveAsync });
  mockResize.mockReturnValue({ renderAsync: mockRenderAsync });
  mockManipulate.mockReturnValue({ resize: mockResize });
});

describe('downscalePhoto', () => {
  it('bounds a landscape photo on its width', async () => {
    const uri = await downscalePhoto('file://raw.jpg', 4032, 3024);

    expect(mockResize).toHaveBeenCalledWith({ width: PHOTO_MAX_EDGE, height: 1536 });
    expect(mockSaveAsync).toHaveBeenCalledWith({ compress: PHOTO_QUALITY, format: 'jpeg' });
    expect(uri).toBe('file://scaled.jpg');
  });

  it('bounds a portrait photo on its height, not its width', async () => {
    await downscalePhoto('file://raw.jpg', 3024, 4032);

    // Resizing by width alone would leave this 2731px tall, over the cap.
    expect(mockResize).toHaveBeenCalledWith({ width: 1536, height: PHOTO_MAX_EDGE });
  });

  it('leaves a photo already within the cap untouched', async () => {
    const uri = await downscalePhoto('file://small.jpg', 1600, 1200);

    // Re-encoding it would spend quality and gain nothing.
    expect(mockManipulate).not.toHaveBeenCalled();
    expect(uri).toBe('file://small.jpg');
  });
});
