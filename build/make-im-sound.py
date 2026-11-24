# Writes manager/Assets/im.wav: a soft two-note chime (0.45 s, 22050 Hz, mono, 16-bit) for IM notifications.
import math, struct, sys, wave
out = sys.argv[1] if len(sys.argv) > 1 else 'manager/Assets/im.wav'
sr = 22050
frames = []
for i in range(int(sr * 0.45)):
    t = i / sr
    def note(f, start):
        if t < start:
            return 0.0
        tt = t - start
        return math.sin(2 * math.pi * f * tt) * math.exp(-tt * 9)
    v = 0.33 * note(880, 0) + 0.33 * note(1318.5, 0.12)
    frames.append(struct.pack('<h', int(max(-1, min(1, v)) * 32767)))
w = wave.open(out, 'wb')
w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr); w.writeframes(b''.join(frames)); w.close()
