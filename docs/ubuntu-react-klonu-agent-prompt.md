# ROL
Kıdemli bir frontend mühendisisin (React, TypeScript, Bun). Okunabilir, sade ve test edilebilir kod yazarsın.

# HEDEF
Tarayıcıda çalışan, **Ubuntu 24.04 LTS** masaüstünü (GNOME 46 + Yaru teması + Ubuntu Dock) görsel ve davranışsal olarak birebir taklit eden bir React uygulaması geliştir.

Bu bir "görsel mock" DEĞİL:
- Her uygulama gerçekten çalışır.
- Tüm uygulamalar aynı sanal dosya sistemini (VFS) paylaşır.
- Terminal'de oluşturulan dosya Files'ta anında görünür; Files'ta çift tıklanınca Text Editor'de açılır.

# TEMEL ÇELİŞKİ: TAM ÖZELLİK + MİNİMUM KOD
İkisini birlikte şu kurallarla sağla:

1. **Veri odaklı tasarım:** uygulamalar, dock, kısayollar, sağ tık menüleri ve MIME → uygulama eşlemeleri dizilerden üretilir. Yeni uygulama eklemek = registry'ye 1 kayıt + 1 bileşen dosyası.
2. **Saf mantık UI'dan ayrıdır:** VFS, shell yorumlayıcı, hesap makinesi parser'ı ve pencere snap geometrisi saf TS fonksiyonlarıdır ve test edilir.
3. **Soyutlama** ancak bir desen 3. kez tekrarlandığında yapılır.
4. **Limitler:** dosya ≤ 200 satır, fonksiyon ≤ 40 satır. Toplam bütçe ≈ 5.000 satır (test, asset ve config hariç). Bütçe aşılıyorsa yeni özellik eklemeden önce sadeleştir.
5. **Her mekanik için iki şey zorunlu:**
   - (a) Dosya başında 1–3 satırlık "bu mekanik nasıl çalışır" açıklaması,
   - (b) Saf mantık içeren her mekanik için en az bir birim testi.

   Satır içi yorumu yalnızca açık olmayan yerlerde kullan.
6. **Kısa ama okunur yaz.** Kod golf yok, tek harfli değişken yok.

# TEKNOLOJİ (SABİT)
- **Bun ≥ 1.3:** paket yöneticisi, dev server (HTML import + HMR), bundler, test runner. Vite, Webpack veya Node kullanma.
- **React 19 + TypeScript strict** (`noUncheckedIndexedAccess` açık).
- **Zustand** (+ persist middleware): tek global store, slice'lara bölünmüş.
- **Tailwind CSS v4** (`bun-plugin-tailwind`). Tema tokenleri CSS değişkenlerinde tutulur.
- **@xterm/xterm + @xterm/addon-fit:** Terminal.
- **CodeMirror 6:** Text Editor (syntax highlight, satır numaraları).
- **@fontsource/ubuntu** ve **@fontsource/ubuntu-mono**.
- **lucide-react:** yalnızca Yaru ikonu olmayan küçük UI simgeleri için.

Bu listenin dışına bağımlılık eklemeden önce gerekçesini yaz. `bunfig.toml`, Tailwind eklentisi ve build/splitting flag'lerini hafızadan yazma; güncel Bun dokümanından doğrula.

# KLASÖR YAPISI
```
index.html · bunfig.toml · package.json
src/
  main.tsx · styles.css
  os/      store.ts      (pencereler, odak, workspace, ayarlar, bildirimler)
           fs.ts         (VFS saf fonksiyonları)
           seed.ts       (başlangıç dosyaları)
           keyboard.ts   (global kısayol tablosu)
           useDragResize.ts
  lib/     shell.ts      (komut yorumlayıcı)
           calc.ts
           snap.ts
  shell/   BootSplash, LoginScreen, LockScreen, Desktop, TopBar, QuickSettings,
           CalendarPopover, Dock, Overview, AppGrid, Window, AltTab,
           ContextMenu, Notifications
  apps/    registry.ts + her uygulama için bir dosya/klasör
public/    yaru-icons/, wallpapers/
tests/
```

# REGISTRY SÖZLEŞMESİ
```ts
type AppDef = {
  id: string;
  name: string;
  icon: string;
  component: React.LazyExoticComponent<React.FC<AppProps>>;
  defaultSize: { w: number; h: number };
  minSize?: { w: number; h: number };
  singleInstance?: boolean;
  pinned?: boolean;
  opens?: string[]; // desteklenen MIME türleri
};

type AppProps = { windowId: string; filePath?: string; args?: string[] };
```
Uygulamalar `React.lazy` ile code-split edilir.

# ÇEKİRDEK MEKANİKLER (kabul kriterleriyle)

## Boot / Login / Lock
- Ubuntu logosu ve yükleme noktalarından oluşan splash (~1.5 sn), ardından GDM tarzı giriş ekranı: avatar, kullanıcı `ubuntu`, herhangi bir parola kabul edilir.
- Super+L ile kilit ekranı açılır: büyük saat ve tarih gösterir, tıklayınca parola alanı çıkar.
- Sistem menüsü: Log Out, Restart (splash'a döner), Power Off (siyah ekran + "power on" butonu).

## Top Bar (32px, siyah)
- **Sol:** workspace göstergesi (GNOME 45+ nokta/hap). Tıklanınca Overview açılır.
- **Orta:** saat ve tarih. Tıklanınca takvim ve bildirim listesi açılır; DND toggle'ı da buradadır.
- **Sağ:** ağ, ses ve pil ikonları. Tıklanınca Quick Settings açılır: ses/parlaklık slider'ları, Wi-Fi, Bluetooth, Dark Style, Night Light toggle'ları, Screenshot, Settings, Lock ve Power menüsü.
- Saat her dakika güncellenir. Format Settings'ten 12/24 saat seçilebilir.

## Dock (Ubuntu Dock)
- Varsayılan konum sol, panel modu (tam yükseklik, yarı saydam). En altta "Show Applications" (9 nokta) bulunur.
- Sabitlenmiş ve çalışan uygulamalar gösterilir. Çalışanların yanında açık pencere sayısı kadar nokta olur.
- Tıklama davranışı: kapalıysa açar; açıksa odaklar; zaten odaktaysa minimize eder.
- Sağ tık menüsü: New Window, Pin/Unpin, Quit (tüm pencereleri kapatır), Show Details.
- Settings'ten konum (sol/alt/sağ), ikon boyutu ve otomatik gizleme ayarlanabilir.

## Activities Overview + App Grid
- Overview: açık pencereler ölçeklenmiş küçük resimler olarak görünür; üstte workspace şeridi ve arama alanı bulunur.
- Overview açıkken yazmaya başlamak aramayı başlatır. Arama uygulamalarda ve VFS dosya adlarında yapılır. Enter ilk sonucu açar.
- App Grid: sayfalı uygulama ızgarası. Esc veya boş alana tıklama kapatır.
- Açılış/kapanış animasyonu 250ms. `prefers-reduced-motion` desteklenir.

## Pencere Yöneticisi (en kritik kısım)
- Libadwaita tarzı CSD header bar; sağda minimize, maximize, close butonları; köşe yarıçapı 12px.
- **Odak yönetimi:** tıklanan pencere öne gelir (z-order dizisi); odaksız pencerenin başlığı soluk görünür.
- **Sürükleme ve boyutlandırma:** 8 yönde, Pointer Events + `setPointerCapture` ile. Sürükleme sırasında yalnızca CSS `transform` değişir; store'a sadece `pointerup`'ta yazılır. Hedef 60fps.
- Başlığa çift tıklama maximize/restore yapar.
- **Edge snap:** üst kenara sürükleme maximize, sol/sağ kenar yarım ekran yapar. Bırakmadan önce yarı saydam önizleme gösterilir. Maximize/snap edilmiş pencere sürüklenince eski boyutuna döner.
- **Minimize:** dock ikonuna doğru küçülme animasyonu. Pencere UNMOUNT EDİLMEZ (gizlenir); terminal geçmişi ve editör içeriği korunur.
- Pencereler ekran dışına kaçamaz: başlık çubuğu en az 40px görünür kalır.
- **Sınırlar:** top bar ve dock'un kapladığı alan çalışma alanından düşülür.
- `snap.ts` saf fonksiyonları test edilir.

## Workspaces
- Dinamik workspace yapısı: son workspace her zaman boştur. Her pencerenin `workspace` alanı vardır.
- Ctrl+Alt+←/→ ile workspace değiştirilir (kayma animasyonuyla). Overview'da pencere başka workspace'e sürüklenebilir.

## Klavye
Kısayollar tek bir tabloda (`keyboard.ts`) tanımlanır:

| Kısayol | Eylem |
|---|---|
| Super | Overview aç/kapat |
| Super+A | App Grid |
| Alt+Tab / Alt+Shift+Tab | Pencere değiştirici (ikon şeridi) |
| Alt+F4 | Odaktaki pencereyi kapat |
| Super+↑/↓/←/→ | Maximize / restore-minimize / sol-sağ snap |
| Super+D | Masaüstünü göster |
| Ctrl+Alt+T | Terminal |
| Super+L | Kilitle |
| Print | Ekran görüntüsü bildirimi (sahte) |

**TARAYICI KISITI:** Super, Alt+Tab ve Ctrl+Alt+T host OS veya tarayıcı tarafından yakalanabilir.
- **Çözüm 1:** tam ekran + `navigator.keyboard.lock()` (Chromium). Destek feature-detect ile kontrol edilir.
- **Çözüm 2:** kilit yoksa alternatif kısayollar kullanılır (ör. Alt+\` → Alt+Tab, Ctrl+Shift+Space → Overview). Alternatifler Settings > Keyboard'da listelenir.
- İlk açılışta tek seferlik "Tam ekran için F11" ipucu bildirimi gösterilir.

## Masaüstü ve Sağ Tık
- Masaüstünde Home ve Trash ikonları, ayrıca `~/Desktop` içeriği bulunur. Simgeler seçilebilir, sürüklenebilir ve çift tıkla açılır.
- Masaüstü sağ tık menüsü: New Folder, New Document, Paste, Open in Terminal, Change Background…, Display Settings.
- Tek bir `ContextMenu` bileşeni kullanılır; menü içeriği her yerde veri dizisiyle verilir. Menü ekran kenarına taşmaz ve klavyeyle gezilebilir.

## Bildirimler
- `notify({ title, body, icon, action? })` API'si sağ üstte toast gösterir ve takvim panelindeki listeye ekler.
- DND açıkken toast gösterilmez, sadece listeye eklenir.

# SANAL DOSYA SİSTEMİ (`fs.ts`)
- Düz `Record<string, FsNode>` yapısı; anahtar mutlak yoldur.
  ```ts
  type FsNode = {
    type: 'file' | 'dir';
    content?: string;
    mime?: string;
    mtime: number;
    size: number;
  };
  ```
- **Saf API:** `resolve(cwd, path)` (`~`, `.`, `..` destekli) · `list` · `stat` · `read` · `write` · `mkdir(-p)` · `rm(-r)` · `mv` · `cp(-r)` · `trash` · `restore` · `emptyTrash`. Hatalar Linux mesajlarıyla döner ("No such file or directory" vb.).
- **Seed içeriği:** `/home/ubuntu/{Desktop,Documents,Downloads,Music,Pictures,Videos}`, örnek `README.txt`, `notes.md`, birkaç görsel (public/ yolu veya küçük data URL). Trash: `~/.local/share/Trash`.
- **Kalıcılık:** zustand persist + localStorage, `version` + `migrate` ile. 5MB'a yaklaşınca uyarı bildirimi gösterilir. Depolama katmanı tek bir adapter'dadır; ileride IndexedDB'ye geçiş tek dosyalık değişiklik olmalı.
- Settings > About içinde "Reset system" butonu bulunur.

# UYGULAMALAR (hepsi gerçekten çalışmalı)

### 1. Files (Nautilus)
- Kenar çubuğu: Recent, Starred, Home, klasörler, Trash.
- Breadcrumb yol çubuğu (tıklanabilir; Ctrl+L ile yazılabilir).
- Grid/List görünümü, ad/boyut/tarihe göre sıralama, ileri/geri.
- Oluştur, yeniden adlandır (F2), sil (Delete → Trash), kes/kopyala/yapıştır (Ctrl+X/C/V).
- Çoklu seçim (Ctrl/Shift ve kutu seçimi), klasörler arası sürükle-bırak.
- Çift tıklama MIME'a göre ilgili uygulamayı açar. Bilinmeyen türde "Open With" diyaloğu çıkar.
- Trash görünümünde Restore ve Empty Trash.

### 2. Terminal
- xterm.js üzerinde çalışır. Prompt `ubuntu@ubuntu:~$` (Ubuntu renkleriyle).
- **Komutlar:** `ls (-l, -a)`, `cd`, `pwd`, `cat`, `echo`, `mkdir (-p)`, `touch`, `rm (-r)`, `mv`, `cp (-r)`, `tree`, `grep`, `head`, `tail`, `wc`, `clear`, `history`, `whoami`, `date`, `uname (-a)`, `hostname`, `neofetch` (ASCII Ubuntu logosu + gerçek oturum bilgisi), `help`, `exit`.
- **Operatörler:** `|`, `>`, `>>`, `&&`. Tırnaklı argüman ayrıştırma desteklenir.
- `gedit/nano dosya` → Text Editor açılır. `xdg-open dosya` → ilgili uygulama. `firefox url` → tarayıcı açılır.
- `sudo` parola sorar, ardından komutu çalıştırır. Bilinmeyen komutta `Command 'x' not found` mesajı verilir.
- ↑/↓ geçmiş (oturumlar arası kalıcı), Tab ile komut ve yol tamamlama, Ctrl+C, Ctrl+L, sekmeler (Ctrl+Shift+T).
- `shell.ts` saf fonksiyondur: `(input, ctx) => { output, newCwd, sideEffects }`. Yoğun şekilde test edilir.

### 3. Text Editor
- CodeMirror 6; uzantıya göre highlight.
- Aç (VFS dosya seçici), Kaydet (Ctrl+S), Farklı Kaydet.
- Kaydedilmemiş değişiklikte başlıkta "•" gösterilir; kapatırken onay sorulur.
- Bul/Değiştir (Ctrl+F/H), satır:sütun göstergesi, sekmeler.

### 4. Firefox
- Sekmeler, URL çubuğu, geri/ileri/yenile, yer imleri çubuğu.
- URL değilse arama motoru URL'sine çevrilir.
- İçerik iframe'de gösterilir. X-Frame-Options/CSP yüzünden yüklenemeyen sitelerde Firefox tarzı hata sayfası ve "Yeni sekmede aç" butonu gösterilir.
- Ana sayfa yerel bir HTML sayfasıdır. iframe'e gömülebildiği DOĞRULANMIŞ birkaç siteyi kısayol olarak koy.

### 5. Calculator
- Basic ve Advanced modlar, geçmiş, tam klavye desteği.
- `calc.ts` kendi parser'ını kullanır (shunting-yard); `eval` ve `new Function` YASAK.

### 6. Image Viewer
- Zoom (tekerlek/pinch/butonlar), pan, sığdır/1:1, klasördeki önceki/sonraki görsel (←/→), döndürme.

### 7. Settings
- **Appearance:** Light/Dark, accent rengi (Ubuntu'nun accent paleti), dock ayarları.
- **Background:** duvar kağıdı seçimi ve VFS'ten görsel.
- **Sound:** ses seviyesi. **Date & Time:** 12/24 saat.
- **Keyboard:** kısayol tablosu (salt okunur).
- **About:** cihaz adı, sahte donanım bilgisi, "Reset system".
- Tüm değişiklikler anında uygulanır ve kalıcıdır.

### 8. System Monitor
- **Processes:** gerçek açık pencerelerden üretilir; "End Process" pencereyi gerçekten kapatır.
- **Resources:** CPU/RAM grafikleri (canvas veya SVG, gerçekçi rastgele yürüyüş).
- **File Systems:** VFS kullanımını gösterir.

### 9. Bonus
Yalnızca çekirdek bittikten ve bütçe izin verirse: GNOME Mines, Clocks.

# GÖRSEL SADAKAT
- Referans: Ubuntu 24.04 ekran görüntüleri. Her shell bileşenini referansla karşılaştır.
- Yaru paleti: turuncu `#E95420`, aubergine tonları. Light ve Dark temalar CSS değişkenleriyle.
- Ubuntu fontu. Pencere gölgeleri, blur'lu yarı saydam dock ve overlay'ler.
- Animasyonlar 150–250ms ease-out; `prefers-reduced-motion` desteklenir.
- İkonlar: Yaru icon theme (CC BY-SA 4.0) kullanılır, About'ta atıf verilir.
- Ubuntu logosu Canonical'ın ticari markasıdır; proje kişisel/eğitim amaçlıdır, README'de bu belirtilir.

# ÇALIŞMA ŞEKLİ (FAZLAR)
| Faz | İçerik |
|---|---|
| 0 | Bun iskeleti, `bun dev` çalışır, Tailwind ve fontlar yüklü |
| 1 | store + `fs.ts` + seed + testler |
| 2 | Desktop, TopBar, Dock, Window, `useDragResize`, snap |
| 3 | Terminal + Files (VFS entegrasyonu uçtan uca) |
| 4 | Text Editor, Calculator, Image Viewer, Settings, Firefox, System Monitor |
| 5 | Overview, App Grid, Workspaces, Alt+Tab, kısayollar, Lock/Login/Boot, bildirimler |
| 6 | Cilalama, performans (React DevTools profiler), erişilebilirlik (odak halkaları, aria-label, klavyeyle gezinme), satır bütçesi denetimi ve sadeleştirme |

**Her fazın sonunda:**
- `bunx tsc --noEmit`, `bun test` ve `bun run build` hatasız geçmeli.
- `wc -l` ile modül bazında satır raporu ver.
- 3–5 maddelik değişiklik özeti yaz.
- Tarayıcı/Playwright erişimin varsa ekran görüntüsü al ve referansla kıyasla.

Bir faz yeşil olmadan sonrakine geçme.

# TEST
- `bun test`: fs, shell, calc ve snap için saf testler + store aksiyonları.
- happy-dom ile 2–3 kritik bileşen testi: pencere aç/kapat/minimize, dock tıklama döngüsü.
- Opsiyonel Playwright e2e senaryosu: boot → login → Terminal'de `mkdir test && cd test && echo hi > a.txt` → Files'ta görünür → çift tık → editörde aç → düzenle → Ctrl+S → Terminal'de `cat` ile doğrula.

# YASAKLAR
- `any`, `@ts-ignore`, `eval` / `new Function`.
- Backend veya harici API (her şey istemcide çalışır).
- Çalışmayan buton: her tıklanabilir öğe ya çalışır ya da Ubuntu'daki gibi devre dışı (gri) görünür.
- Redux, Context zinciri veya ikinci bir state kütüphanesi.
- Tek dosyaya yığılmış dev bileşenler veya 3 kat soyutlanmış "framework" kodu.

# BİTTİ TANIMI (DoD)
- [ ] Tüm fazların kabul kriterleri sağlandı.
- [ ] Tüm uygulamalar VFS üzerinden birbirine bağlı ve kalıcı.
- [ ] Sürükleme ve animasyonlar 60fps, konsolda hata/uyarı yok.
- [ ] Toplam satır ≤ ~5.000 (test/asset hariç), dosya ≤ 200 satır.
- [ ] README: kurulum (`bun install`, `bun dev`, `bun test`, `bun run build`), mimari diyagramı (Mermaid), modül satır tablosu, bilinen kısıtlar (iframe engelleri, tarayıcı kısayolları), lisans ve atıflar.
