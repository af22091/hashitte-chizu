#!/usr/bin/env python3
"""BGM候補をオリジナル曲として作って、GM音源(サンプル録音された楽器)で書き出す。
使い方: python3 compose.py <出力フォルダ> [曲番号 ...]"""
import sys, re, random, subprocess, numpy as np, tinysoundfont
from scipy.signal import fftconvolve

SR = 44100
SF = '/usr/share/sounds/sf2/TimGM6mb.sf2'
NAMES = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def nn(s):                                   # 'C#5' -> 73  (C4=60)
    m = re.match(r'([A-G])([#b]?)(-?\d)$', s); n = NAMES[m.group(1)] + (1 if m.group(2) == '#' else -1 if m.group(2) == 'b' else 0)
    return n + 12 * (int(m.group(3)) + 1)

class Track:
    def __init__(self, bpm, bars, swing=0.0):
        self.bpm, self.bars, self.swing, self.ev, self.prog = bpm, bars, swing, [], {}
        self.rng = random.Random(7)
    def inst(self, ch, preset, bank=0, vol=100, pan=64): self.prog[ch] = (bank, preset, vol, pan)
    def note(self, ch, beat, n, vel, dur):
        if self.swing and abs((beat * 2) % 2 - 1) < 1e-6: beat += self.swing * 0.5          # 裏拍を少し遅らせる(ゆれ)
        beat += self.rng.uniform(-0.012, 0.012) * self.bpm / 60 * (0 if beat < 0.01 else 1)  # 人間らしいタイミングのゆらぎ
        vel = int(max(1, min(127, vel + self.rng.randint(-6, 6))))
        self.ev.append((max(0, beat), ch, n, vel, dur))
    def strum(self, ch, beat, notes, vel, dur, spread=0.03, down=True):
        ns = list(notes) if down else list(reversed(notes))
        for i, n in enumerate(ns): self.note(ch, beat + i * spread, n, vel - i * 2, dur)
    def grid(self, ch, bar, pattern, vel, bar_len=4, step=0.5, mult=1.7, octave=0):   # 8分音符のメロディ表記
        toks = pattern.split(); i = 0; start = bar * bar_len
        while i < len(toks):
            t = toks[i]
            if t == '.': i += 1; continue
            j = i + 1
            while j < len(toks) and toks[j] == '-': j += 1
            self.note(ch, start + i * step, nn(t) + 12 * octave, vel, (j - i) * step * mult if j - i > 1 else step * mult)
            i = j
    def render(self, tail=3.0):
        s = tinysoundfont.Synth(samplerate=SR, gain=0.0); sf = s.sfload(SF)
        for ch, (bank, preset, vol, pan) in self.prog.items():
            s.program_select(ch, sf, bank, preset); s.control_change(ch, 7, vol); s.control_change(ch, 10, pan)
        spb = 60.0 / self.bpm; evs = []
        for b, ch, n, v, d in self.ev:
            evs.append((b * spb, 1, ch, n, v)); evs.append(((b + d) * spb, 0, ch, n, 0))
        evs.sort(key=lambda e: (e[0], e[1]))
        total = int((self.bars * 4 * spb + tail) * SR); out = np.zeros((total, 2), dtype=np.float32); pos = 0
        for t, on, ch, n, v in evs:
            tgt = min(total, int(t * SR))
            if tgt > pos: out[pos:tgt] = np.frombuffer(s.generate(tgt - pos), dtype=np.float32).reshape(-1, 2); pos = tgt
            (s.noteon(ch, n, v) if on else s.noteoff(ch, n))
        if pos < total: out[pos:] = np.frombuffer(s.generate(total - pos), dtype=np.float32).reshape(-1, 2)
        return out

def reverb(x, wet=0.16, sec=1.6):
    n = int(sec * SR); rng = np.random.default_rng(3); t = np.arange(n) / SR
    ir = (rng.standard_normal((n, 2)) * np.exp(-t * 3.2)[:, None]).astype(np.float32)
    ir[: int(0.012 * SR)] *= np.linspace(0, 1, int(0.012 * SR))[:, None]
    y = np.stack([fftconvolve(x[:, c], ir[:, c])[: len(x)] for c in range(2)], 1)
    return x * (1 - wet) + y * wet * 0.35 / max(1e-6, np.abs(ir).max() * 0.1)

def finish(x, loop_len_s, path_wav, wet=0.16):
    x = reverb(x, wet=wet)
    n = int(loop_len_s * SR); body = x[:n].copy(); tail = x[n:]
    body[: len(tail)] += tail[: len(body)]                    # 余韻を頭にかぶせて、つなぎ目なくループ
    pk = np.abs(body).max(); body = body / pk * 0.89
    fade = int(0.01 * SR); body[:fade] *= np.linspace(0, 1, fade)[:, None]; body[-fade:] *= np.linspace(1, 0, fade)[:, None]
    import wave
    with wave.open(path_wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes((body * 32767).astype('<i2').tobytes())

# ---- コード(ギター/ウクレレ向けの押さえ) ----
CH = {
    'C': [48, 55, 60, 64, 67], 'Am7': [45, 57, 60, 64, 67], 'F': [41, 53, 57, 60, 65], 'G7': [43, 55, 59, 62, 65], 'Dm7': [50, 57, 60, 62, 65],
    'Cmaj7': [48, 55, 59, 64, 67], 'A7': [45, 55, 59, 61, 64], 'Em7': [40, 55, 59, 62, 64], 'G': [43, 55, 59, 62, 67], 'Am': [45, 57, 60, 64, 69],
}
ROOT = {'C': 36, 'Am7': 33, 'Am': 33, 'F': 41, 'G7': 43, 'G': 43, 'Dm7': 38, 'Cmaj7': 36, 'A7': 33, 'Em7': 40}
UKE = lambda c: [n + 12 for n in CH[c][1:]]      # ウクレレっぽく高い音域

CH.update({'E7': [40, 52, 56, 59, 62], 'Fmaj7': [41, 52, 57, 60, 64]}); ROOT.update({'E7': 40, 'Fmaj7': 41})
# GMドラムキットの音(指パッチン・ジャンベ・カホンは近い音で代用)
KICK, SIDE, SNARE, CLAP, HAT, TOMLO, TOMMID, CABASA, MARACAS, TAMB, COWBELL, TRI_O, TRI_M, WB_HI, WB_LO, BONGO_HI, BONGO_LO, CONGA_MUTE, CONGA_HI, CONGA_LO, CLAVES = 36, 37, 38, 39, 42, 41, 45, 69, 70, 54, 56, 81, 80, 76, 77, 60, 61, 62, 63, 64, 75

def t1():   # 候補1 ビーチ・カフェ: アコギ・ウクレレ・ウッドベース・マリンバ・カホン・指パッチン・手拍子
    T = Track(104, 16, swing=0.05)
    T.inst(0, 12, vol=104, pan=76); T.inst(1, 25, vol=96, pan=46); T.inst(2, 24, vol=84, pan=82); T.inst(3, 32, vol=100, pan=64); T.inst(4, 73, vol=92, pan=88); T.inst(5, 21, vol=70, pan=40); T.inst(9, 0, bank=128, vol=86, pan=64)
    prog = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'] * 2
    mel = ["E5 . G5 . A5 G5 E5 .", "D5 . G5 . B5 A5 G5 .", "E5 . A5 . C6 B5 A5 .", "A5 . G5 F5 E5 . C5 .", "E5 . G5 . C6 . B5 G5", "D5 . G5 B5 . A5 G5 .", "A5 . F5 A5 C6 . A5 F5", "G5 - - - . . . ."]
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = ROOT[c] + 12; ch = CH[c]
        T.grid(0, bar, mel[bar % 8], 92, mult=1.6)
        if bar >= 8: T.grid(4, bar, mel[bar % 8], 74, mult=1.3, octave=0)
        T.strum(1, b0, ch[1:], 80, 1.0, 0.028)
        for bt, dn, v in ((1.5, False, 62), (2, True, 70), (3, False, 60), (3.5, True, 64)): T.strum(1, b0 + bt, ch[2:], v, 0.4, 0.02, down=dn)
        for bt in (0.5, 1.5, 2.5, 3.5): T.strum(2, b0 + bt, UKE(c)[:3], 58, 0.25, 0.01, down=(bt != 2.5))
        for bt, nt, d in ((0, r, 1.4), (2, r + 7, 0.9), (3, r, 0.9)): T.note(3, b0 + bt, nt, 82, d)
        if bar >= 4: T.strum(5, b0, [n + 0 for n in ch[2:]], 52, 3.6, 0.05)
        T.note(9, b0, KICK, 84, 0.2); T.note(9, b0 + 2.5, KICK, 70, 0.2)                        # カホン風の低い音
        T.note(9, b0 + 1, SIDE, 80, 0.1); T.note(9, b0 + 3, SIDE, 80, 0.1)                       # カホン風の高い音
        for k in range(8): T.note(9, b0 + k * 0.5, CABASA, 46 if k % 2 == 0 else 62, 0.08)       # シェイカー
        if bar >= 8:
            T.note(9, b0 + 1, CLAP, 70, 0.1); T.note(9, b0 + 3, CLAP, 70, 0.1)                   # 手拍子
        else:
            T.note(9, b0 + 1, SIDE, 40, 0.05); T.note(9, b0 + 3, SIDE, 40, 0.05)                 # 指パッチン風(小さく)
    return T

def t2():   # 候補2 カリブ・パーティ: スチールパン・ミュートトランペット・トロンボーン・ボンゴ・コンガ・カウベル・マラカス・タンバリン
    T = Track(110, 16, swing=0.06)
    T.inst(0, 114, vol=104, pan=72); T.inst(1, 59, vol=92, pan=84); T.inst(2, 57, vol=92, pan=44); T.inst(3, 33, vol=102, pan=64); T.inst(4, 24, vol=84, pan=52); T.inst(5, 24, vol=72, pan=88); T.inst(9, 0, bank=128, vol=88, pan=64)
    prog = ['C', 'Am7', 'F', 'G7', 'C', 'Am7', 'Dm7', 'G7'] * 2
    mel = ["G5 . E5 G5 . A5 G5 .", "E5 . C5 E5 . G5 E5 .", "F5 . A5 F5 . G5 F5 .", "D5 . F5 G5 . B4 D5 .", "G5 . E5 G5 . C6 A5 .", "A5 . G5 E5 . C5 E5 .", "F5 . D5 F5 . A5 F5 .", "G5 . F5 D5 B4 . D5 ."]
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = ROOT[c] + 12; ch = CH[c]
        T.grid(0, bar, mel[bar % 8], 96, mult=1.9)
        if bar >= 8:   # 後半はホーンが合いの手
            for bt in (1.5, 2.5): T.strum(1, b0 + bt, [n + 12 for n in ch[2:4]], 84, 0.3, 0.01)
            T.note(2, b0, ROOT[c] + 12, 88, 0.5); T.note(2, b0 + 2, ROOT[c] + 19, 80, 0.5)
        for bt, nt, d in ((0, r, 1.4), (1.5, r + 7, 0.45), (2.5, r, 0.45), (3, r + 7, 0.9)): T.note(3, b0 + bt, nt, 88, d)
        T.strum(4, b0, ch[1:], 70, 1.0, 0.025)
        for bt, dn in ((1.5, False), (2.5, True), (3.5, False)): T.strum(5, b0 + bt, UKE(c)[:3], 62, 0.26, 0.01, down=dn)
        for bt, nt, v in ((0, CONGA_LO, 86), (1, CONGA_MUTE, 58), (1.5, CONGA_HI, 76), (2, CONGA_HI, 72), (2.5, CONGA_LO, 78)): T.note(9, b0 + bt, nt, v, 0.2)
        for bt, nt in ((0.5, BONGO_HI), (1, BONGO_LO), (2.5, BONGO_HI), (3, BONGO_LO), (3.5, BONGO_HI)): T.note(9, b0 + bt, nt, 66, 0.15)
        for k in range(8): T.note(9, b0 + k * 0.5, MARACAS, 50 if k % 2 == 0 else 72, 0.08)
        for bt in (0, 2.5): T.note(9, b0 + bt, COWBELL, 62, 0.2)
        for bt in (1, 3): T.note(9, b0 + bt, TAMB, 56, 0.15)
    return T

def t3():   # 候補3 ボサノバ・ラウンジ: ガットギター・エレピ・フルート・サックス・ヴィブラフォン・ウッドベース・ブラシ
    T = Track(112, 16, swing=0.04)
    T.inst(0, 73, vol=100, pan=78); T.inst(1, 24, vol=96, pan=46); T.inst(2, 4, vol=84, pan=56); T.inst(3, 32, vol=98, pan=64); T.inst(4, 66, vol=92, pan=84); T.inst(5, 11, vol=76, pan=90); T.inst(9, 40, bank=128, vol=72, pan=64)
    prog = ['Cmaj7', 'Am7', 'Dm7', 'G7', 'Em7', 'A7', 'Dm7', 'G7'] * 2
    mel = ["E5 - G5 - B5 - A5 G5", "A5 - - - G5 E5 C5 .", "D5 - F5 - A5 - G5 F5", "G5 - - . B4 D5 F5 .", "E5 - G5 - B5 - D6 B5", "C#6 - A5 - E5 . A5 .", "F5 - A5 - D6 - C6 A5", "B5 - - - G5 - - ."]
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = ROOT[c] + 12; ch = CH[c]
        T.grid(0 if bar < 8 else 4, bar, mel[bar % 8], 86, mult=1.0, octave=0 if bar < 8 else -1)
        if bar >= 8: T.grid(0, bar, mel[bar % 8], 52, mult=1.0, octave=0)
        for bt, nt in ((0, r), (2, r + 7)): T.note(3, b0 + bt, nt, 78, 1.8)
        T.note(1, b0, ch[1], 66, 0.9)
        for bt in (0.5, 1.5, 3.0, 3.5): T.strum(1, b0 + bt, ch[2:], 64, 0.35, 0.02)
        for bt in (0.5, 2.5): T.strum(2, b0 + bt, [n + 12 for n in ch[2:]], 58, 1.2, 0.012)       # エレピのコンピング
        if bar % 2 == 1: T.note(5, b0 + 3.5, ch[3] + 24, 60, 0.6)
        for bt in (0, 1.5, 3): T.note(9, b0 + bt, SIDE, 66, 0.15)
        T.note(9, b0, KICK, 56, 0.2); T.note(9, b0 + 2.5, KICK, 48, 0.2)
        for k in range(8): T.note(9, b0 + k * 0.5, HAT, 40 if k % 2 == 0 else 54, 0.1)
        for k in range(0, 8, 2): T.note(9, b0 + k * 0.5, CABASA, 38, 0.08)
    return T

def t4():   # 候補4 ハッピー・ポップ: ピアノ・シロフォン・クラリネット・ウクレレ・エレキベース・手拍子・指パッチン・タンバリン・トライアングル・ウッドブロック
    T = Track(120, 16)
    T.inst(0, 13, vol=100, pan=78); T.inst(1, 0, vol=96, pan=52); T.inst(2, 71, vol=90, pan=86); T.inst(3, 33, vol=100, pan=64); T.inst(4, 24, vol=84, pan=44); T.inst(9, 0, bank=128, vol=84, pan=64)
    prog = ['C', 'G', 'Am', 'F', 'C', 'G', 'F', 'G'] * 2
    mel = ["E6 . E6 D6 C6 . G5 .", "D6 . D6 C6 B5 . G5 .", "C6 . C6 B5 A5 . E5 .", "A5 . C6 A5 F5 . . .", "E6 . G6 E6 C6 . G5 .", "D6 . D6 B5 G5 . B5 .", "A5 . C6 . F6 . E6 C6", "D6 . . B5 . G5 . ."]
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = ROOT[c] + 12; ch = CH[c]
        T.grid(0, bar, mel[bar % 8], 90, mult=1.2)
        if bar >= 8: T.grid(2, bar, mel[bar % 8], 78, mult=1.4, octave=-1)
        for bt, nt in ((0, r), (2, r + 7)): T.note(3, b0 + bt, nt, 90, 0.8)
        T.note(1, b0, ch[0] + 12, 60, 0.4); T.note(1, b0 + 2, ch[0] + 12, 60, 0.4)
        for bt in (1, 3): T.strum(1, b0 + bt, ch[1:4], 72, 0.3, 0.01)
        for bt in (0.5, 1.5, 2.5, 3.5): T.strum(4, b0 + bt, UKE(c)[:3], 56, 0.22, 0.01, down=(bt % 1 == 0.5))
        T.note(9, b0, KICK, 76, 0.2); T.note(9, b0 + 2, KICK, 66, 0.2)
        for bt in (1, 3): T.note(9, b0 + bt, CLAP, 82, 0.1); T.note(9, b0 + bt + 0.5, SIDE, 40, 0.05)   # 手拍子と指パッチン風
        for k in range(8): T.note(9, b0 + k * 0.5, TAMB if k % 2 else HAT, 54 if k % 2 else 44, 0.1)
        if bar % 2 == 0: T.note(9, b0, TRI_O, 100, 0.6)
        if bar % 4 == 3: T.note(9, b0 + 3, WB_HI, 70, 0.1); T.note(9, b0 + 3.5, WB_LO, 70, 0.1)
    return T

def t5():   # 候補5 ラテン・フィエスタ: アコーディオン・トランペット・オルガン・ガットギター・エレキベース・コンガ・ボンゴ・ジャンベ・カウベル・タンバリン・トライアングル・ウッドブロック
    T = Track(120, 16)
    T.inst(0, 21, vol=100, pan=74); T.inst(1, 56, vol=90, pan=84); T.inst(2, 16, vol=62, pan=44); T.inst(3, 24, vol=94, pan=50); T.inst(4, 33, vol=100, pan=64); T.inst(9, 0, bank=128, vol=88, pan=64)
    prog = ['Am7', 'Dm7', 'E7', 'Am7', 'Dm7', 'G7', 'Cmaj7', 'E7'] * 2
    mel = ["E5 . A5 . C6 . B5 A5", "A5 . D6 . F6 . E6 D6", "G#5 . B5 . E6 . D6 B5", "C6 - - - A5 . . .", "D6 . F6 . A6 . F6 D6", "D6 . B5 . G5 . B5 D6", "E6 . C6 . G5 . C6 E6", "G#5 . B5 . E6 - - ."]
    for bar, c in enumerate(prog):
        b0 = bar * 4; r = ROOT[c] + 12; ch = CH[c]
        T.grid(0, bar, mel[bar % 8], 90, mult=1.4)
        if bar >= 8: T.grid(1, bar, mel[bar % 8], 84, mult=1.3, octave=0)
        if bar >= 4: T.strum(2, b0, ch[1:], 60, 3.8, 0.02)
        for k in range(8): T.strum(3, b0 + k * 0.5, ch[2:], 74 if k % 2 else 58, 0.3, 0.008, down=(k % 2 == 0))
        for bt, nt, d in ((0, r, 0.7), (1.5, r + 7, 0.45), (2, r, 0.7), (3.5, r + 7, 0.45)): T.note(4, b0 + bt, nt, 94, d)
        for bt, nt, v in ((0, CONGA_LO, 88), (1.5, CONGA_LO, 80), (2, CONGA_LO, 88), (3.5, CONGA_HI, 74)): T.note(9, b0 + bt, nt, v, 0.2)
        for bt, nt in ((0.5, BONGO_HI), (1, BONGO_LO), (2.5, BONGO_HI), (3, BONGO_LO)): T.note(9, b0 + bt, nt, 64, 0.15)
        T.note(9, b0, TOMLO, 76, 0.3); T.note(9, b0 + 2.5, TOMMID, 66, 0.25)                      # ジャンベ風の太鼓
        for bt in (0, 1.5, 3): T.note(9, b0 + bt, COWBELL, 60, 0.2)
        for k in range(8): T.note(9, b0 + k * 0.5, TAMB, 44 if k % 2 == 0 else 62, 0.1)
        for bt in (0, 2): T.note(9, b0 + bt, TRI_O if bt == 0 else TRI_M, 100, 0.5)
        if bar % 4 == 3: T.note(9, b0 + 3, WB_HI, 70, 0.1); T.note(9, b0 + 3.5, WB_LO, 70, 0.1)
    return T

def lowered(fn, shift=-5, mel_extra=-12, mel_preset=None, bpm=None, vol_mel=None):
    """既存の曲を、キーを下げて・メロディをさらに1オクターブ下げて・少しゆっくりにした「低め」版にする"""
    def make():
        T = fn()
        T.ev = [(b, ch, (n if ch == 9 else n + shift + (mel_extra if ch == 0 else 0)), v, d) for (b, ch, n, v, d) in T.ev]
        if mel_preset is not None: bank, _, vol, pan = T.prog[0]; T.prog[0] = (bank, mel_preset, vol_mel or vol, pan)
        if bpm: T.bpm = bpm
        return T
    return make

def calm(fn, bpm=76, mel_preset=None, shift=-5, mel_extra=-12):
    """ゆっくり・落ち着いた版: 低め + 打楽器をほとんど外す + メロディは裏拍を抜いて音を長く + 全体をやわらかく + 残響を深く"""
    def make():
        T = fn(); out = []
        for (b, ch, n, v, d) in T.ev:
            frac = round(b % 1, 2)
            if ch == 9:
                if n == 36: out.append((b, ch, n, int(v * 0.55), d))
                elif n == 37 and frac == 0.0: out.append((b, ch, n, int(v * 0.5), d))
                elif n in (42, 69) and frac == 0.0: out.append((b, ch, n, int(v * 0.55), d))
                continue
            n = n + shift + (mel_extra if ch == 0 else 0)
            if ch == 0:
                if frac in (0.5, 0.75, 0.25) and d < 1.2: continue          # メロディの裏拍を抜いてゆったり
                out.append((b, ch, n, int(v * 0.85), d * 1.5))
            elif d < 0.45: continue                                          # 細かいカッティングは外す
            else: out.append((b, ch, n, int(v * 0.72), d * 1.2))
        T.ev = out; T.bpm = bpm; T.wet = 0.24
        if mel_preset is not None: bank, _, vol, pan = T.prog[0]; T.prog[0] = (bank, mel_preset, vol, pan)
        return T
    return make

TRACKS = {1: ('スロー・ビーチカフェ', calm(t1, bpm=72)), 2: ('スロー・ボサノバ(サックス)', calm(t3, bpm=74, mel_preset=66)), 3: ('スロー・ヴィブラフォン・ポップ', calm(t4, bpm=76, mel_preset=11)), 4: ('スロー・カリブ(マリンバ)', calm(t2, bpm=76, mel_preset=12))}
if __name__ == '__main__':
    out = sys.argv[1]; which = [int(a) for a in sys.argv[2:]] or list(TRACKS)
    for i in which:
        name, fn = TRACKS[i]; T = fn(); x = T.render(); loop = T.bars * 4 * 60.0 / T.bpm
        finish(x, loop, f'{out}/bgm{i}.wav', wet=getattr(T, 'wet', 0.16))
        subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', f'{out}/bgm{i}.wav', '-codec:a', 'libmp3lame', '-b:a', '96k', f'{out}/bgm{i}.mp3'], check=True)
        print(i, name, round(loop, 1), 's')
