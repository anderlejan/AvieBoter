using System.Text.Json.Nodes;
using System.Windows;
using System.Windows.Controls;
using System.Windows.Controls.Primitives;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Imaging;
using System.Windows.Shapes;
using System.Windows.Threading;
using AvieBoter.Core;

namespace AvieBoter.UI;

/// <summary>The Puppeteer: a small window above all others (also above the viewer) to walk, turn and fly a bot by hand,
/// with a map that can be shown and a button for the HUD's camera. Drawn by WPF itself (no web page), so the whole
/// window can be made see-through.</summary>
public class PuppetWindow : Window
{
    static readonly Dictionary<string, PuppetWindow> open = new();
    readonly App app;
    readonly BotRunner bot;
    readonly Dictionary<string, DispatcherTimer> holds = new();
    readonly Dictionary<Key, string> keysDown = new();
    readonly Dictionary<string, Button> padButtons = new();
    readonly TextBlock stateText = new() { Foreground = Fg2, FontSize = 11, Margin = new Thickness(6, 0, 0, 0), VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
    readonly TextBlock whereText = new() { Foreground = Fg2, FontSize = 11, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis };
    readonly Border mapBox = new();
    readonly Canvas map = new() { Width = 204, Height = 204, ClipToBounds = true, Background = new SolidColorBrush(Color.FromRgb(0x1A, 0x21, 0x2B)) };
    readonly ComboBox zoom = new() { FontSize = 11, Width = 64 };
    Button camB = null!, mapB = null!, runB = null!, flyB = null!, standB = null!;
    bool camOn, mapOn, runOn, flyOn;
    // after Fly / Run is pressed the status still shows the old state for a few seconds: don't flip the button back
    DateTime ownStateUntil = DateTime.MinValue;
    readonly DispatcherTimer refresh = new() { Interval = TimeSpan.FromSeconds(1) };
    DateTime noteUntil = DateTime.MinValue;
    string tileKey = "";
    BitmapImage? tile;

    static readonly Brush Bg = new SolidColorBrush(Color.FromRgb(0x22, 0x2B, 0x38));
    static readonly Brush Bg2 = new SolidColorBrush(Color.FromRgb(0x2C, 0x37, 0x47));
    static readonly Brush Bg3 = new SolidColorBrush(Color.FromRgb(0x3A, 0x48, 0x59));
    static readonly Brush Fg = new SolidColorBrush(Color.FromRgb(0xEE, 0xF3, 0xF9));
    static readonly Brush Fg2 = new SolidColorBrush(Color.FromRgb(0xA9, 0xB6, 0xC6));
    static readonly Brush Acc = new SolidColorBrush(Color.FromRgb(0xB0, 0xDC, 0xFF));
    static readonly Brush OnAcc = new SolidColorBrush(Color.FromRgb(0x0E, 0x22, 0x38));
    static readonly Brush Bad = new SolidColorBrush(Color.FromRgb(0xFF, 0x8A, 0x8A));

    public static void Show(App app, BotRunner bot)
    {
        if (open.TryGetValue(bot.Profile.Id, out var w)) { w.Activate(); return; }
        w = new PuppetWindow(app, bot);
        open[bot.Profile.Id] = w;
        w.Show();
    }

    public static void CloseAll() { foreach (var w in open.Values.ToList()) w.Close(); }

    PuppetWindow(App app, BotRunner bot)
    {
        this.app = app; this.bot = bot;
        var s = app.Settings.Data;
        Title = "Puppeteer – " + bot.Profile.Label;
        WindowStyle = WindowStyle.None;
        AllowsTransparency = true;
        Background = Brushes.Transparent;
        ResizeMode = ResizeMode.NoResize;
        SizeToContent = SizeToContent.WidthAndHeight;
        Topmost = true;
        ShowInTaskbar = true;
        FontFamily = new FontFamily("Segoe UI");
        Opacity = Math.Clamp(s.PuppetOpacity, 30, 100) / 100.0;
        try { Icon = new BitmapImage(new Uri(System.IO.Path.Combine(AppPaths.AppDir, "Assets", "AvieBoter.ico"))); } catch { }
        if (!double.IsNaN(s.PuppetX) && !double.IsNaN(s.PuppetY)) { Left = s.PuppetX; Top = s.PuppetY; WindowStartupLocation = WindowStartupLocation.Manual; }
        else WindowStartupLocation = WindowStartupLocation.CenterScreen;
        Content = Build();
        SetMap(s.PuppetMap);
        PreviewKeyDown += OnKeyDown;
        PreviewKeyUp += OnKeyUp;
        Deactivated += (_, _) => { keysDown.Clear(); ReleaseAll(); };
        refresh.Tick += async (_, _) => await Refresh();
        refresh.Start();
        Loaded += async (_, _) => await Refresh();
        Closing += (_, _) =>
        {
            open.Remove(bot.Profile.Id);
            refresh.Stop();
            foreach (var t in holds.Values) t.Stop();
            holds.Clear();
            s.PuppetX = Left; s.PuppetY = Top; app.Settings.Save();
            if (bot.Running) _ = bot.RunCommand("CompanionMove", new[] { "stop", "0" });
        };
    }

    // ---------- look ----------
    static ControlTemplate Flat()
    {
        var t = new ControlTemplate(typeof(ButtonBase));
        var bd = new FrameworkElementFactory(typeof(Border));
        bd.SetBinding(Border.BackgroundProperty, new System.Windows.Data.Binding("Background") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
        bd.SetBinding(Border.BorderBrushProperty, new System.Windows.Data.Binding("BorderBrush") { RelativeSource = System.Windows.Data.RelativeSource.TemplatedParent });
        bd.SetValue(Border.BorderThicknessProperty, new Thickness(1));
        bd.SetValue(Border.CornerRadiusProperty, new CornerRadius(5));
        var cp = new FrameworkElementFactory(typeof(ContentPresenter));
        cp.SetValue(HorizontalAlignmentProperty, HorizontalAlignment.Center);
        cp.SetValue(VerticalAlignmentProperty, VerticalAlignment.Center);
        bd.AppendChild(cp);
        t.VisualTree = bd;
        return t;
    }
    static readonly ControlTemplate FlatTemplate = Flat();

    Button Btn(string text, string tip, double h = 28, double size = 14)
    {
        var b = new Button
        {
            Content = text, ToolTip = tip, Height = h, FontSize = size, Margin = new Thickness(1.5),
            Background = Bg2, Foreground = Fg, BorderBrush = Bg3, Template = FlatTemplate, Focusable = false, Cursor = Cursors.Hand,
        };
        b.MouseEnter += (_, _) => { if (b.Tag as string != "on") b.Background = Bg3; };
        b.MouseLeave += (_, _) => { if (b.Tag as string != "on") b.Background = Bg2; };
        return b;
    }

    static void Lit(Button b, bool on)
    {
        b.Tag = on ? "on" : null;
        b.Background = on ? Acc : Bg2;
        b.Foreground = on ? OnAcc : Fg;
        b.BorderBrush = on ? Acc : Bg3;
    }

    UIElement Build()
    {
        var root = new StackPanel { Width = 210, Margin = new Thickness(6) };

        // title bar: drag to move
        var bar = new DockPanel { Margin = new Thickness(0, 0, 0, 4), Background = Brushes.Transparent, Cursor = Cursors.SizeAll };
        bar.MouseLeftButtonDown += (_, e) => { if (e.ButtonState == MouseButtonState.Pressed) try { DragMove(); } catch { } };
        var close = Btn("✕", "Close", 20, 11); close.Width = 22;
        camB = Btn("📷", "Your camera in Second Life watches the way the bot faces (HUD 1.6 or newer; distance, height and tilt in the HUD: More ▸ Cam ▸)", 20, 11); camB.Width = 24;
        mapB = Btn("🗺", "Map around the bot", 20, 11); mapB.Width = 24;
        var help = Btn("?", "Keys: W A S D or the arrows walk and turn · Q E step aside · R C up and down · F fly · Space stop. Moving by hand ends following. Drag the title to move this window.", 20, 11); help.Width = 22;
        foreach (var x in new[] { close, help, mapB, camB }) { DockPanel.SetDock(x, Dock.Right); bar.Children.Add(x); }
        var name = new TextBlock { Text = bot.Profile.Label, Foreground = Fg, FontWeight = FontWeights.SemiBold, FontSize = 12, VerticalAlignment = VerticalAlignment.Center, TextTrimming = TextTrimming.CharacterEllipsis, MaxWidth = 90 };
        var title = new StackPanel { Orientation = Orientation.Horizontal };
        title.Children.Add(name); title.Children.Add(stateText);
        bar.Children.Add(title);
        root.Children.Add(bar);
        close.Click += (_, _) => Close();
        help.Click += (_, _) => Note("Keys: WASD/arrows · Q E aside · R C up/down · F fly · Space stop");
        mapB.Click += (_, _) => { SetMap(!mapOn); app.Settings.Data.PuppetMap = mapOn; app.Settings.Save(); };
        camB.Click += async (_, _) => await ToggleCam();

        // map (hidden by default)
        var mapPanel = new StackPanel();
        var mapBar = new DockPanel { Margin = new Thickness(0, 0, 0, 3) };
        foreach (var (t, v) in new[] { ("Region", 256), ("96 m", 96), ("48 m", 48) }) zoom.Items.Add(new ComboBoxItem { Content = t, Tag = v });
        zoom.SelectedIndex = 1;
        DockPanel.SetDock(zoom, Dock.Right);
        mapBar.Children.Add(zoom); mapBar.Children.Add(whereText);
        zoom.SelectionChanged += (_, _) => DrawMap(lastView);
        mapPanel.Children.Add(mapBar);
        mapPanel.Children.Add(new Border { CornerRadius = new CornerRadius(5), ClipToBounds = true, Child = map, HorizontalAlignment = HorizontalAlignment.Center });
        mapBox.Child = mapPanel;
        mapBox.Margin = new Thickness(0, 0, 0, 5);
        root.Children.Add(mapBox);

        // the pad
        var pad = new UniformGrid { Rows = 3, Columns = 3 };
        foreach (var (a, t, tip) in new[] {
            ("turnleft", "↶", "Turn left (A, ←)"), ("forward", "▲", "Forward (W, ↑)"), ("turnright", "↷", "Turn right (D, →)"),
            ("left", "◀", "Step left (Q, Shift+←)"), ("stop", "■", "Stop (Space)"), ("right", "▶", "Step right (E, Shift+→)"),
            ("up", "⤒", "Up / jump (R, PgUp)"), ("back", "▼", "Back (S, ↓)"), ("down", "⤓", "Down (C, PgDn)") })
        {
            var b = Btn(t, tip);
            if (a == "stop") { b.Foreground = Bad; b.Click += (_, _) => { ReleaseAll(); Send("stop"); }; }
            else
            {
                string act = a;
                padButtons[a] = b;
                b.PreviewMouseLeftButtonDown += (_, e) => { e.Handled = true; b.CaptureMouse(); Hold(act); };
                b.PreviewMouseLeftButtonUp += (_, e) => { e.Handled = true; b.ReleaseMouseCapture(); Release(act); };
                b.LostMouseCapture += (_, _) => Release(act);
            }
            pad.Children.Add(b);
        }
        root.Children.Add(pad);

        // run / fly / stand
        var row = new UniformGrid { Rows = 1, Columns = 3, Margin = new Thickness(0, 3, 0, 3) };
        runB = Btn("Run", "Run instead of walk", 22, 11);
        flyB = Btn("Fly", "Fly or land (F)", 22, 11);
        standB = Btn("Stand", "Stand up from a seat", 22, 11);
        runB.Click += (_, _) =>
        {
            // from the bot's real state (the HUD or the app may have changed it), not from this button's last look
            if (DateTime.Now >= ownStateUntil && bot.Status is JsonNode st) runOn = st["running"]?.GetValue<bool>() == true;
            runOn = !runOn; Lit(runB, runOn); Send(runOn ? "run" : "walk"); ownStateUntil = DateTime.Now.AddSeconds(5);
        };
        flyB.Click += (_, _) => ToggleFly();
        standB.Click += (_, _) => Send("stand");
        row.Children.Add(runB); row.Children.Add(flyB); row.Children.Add(standB);
        root.Children.Add(row);

        // see-through
        var opRow = new DockPanel();
        var opLabel = new TextBlock { Text = "◐", Foreground = Fg2, Margin = new Thickness(2, 0, 6, 0), VerticalAlignment = VerticalAlignment.Center, ToolTip = "See-through" };
        var op = new Slider { Minimum = 30, Maximum = 100, Value = Math.Clamp(app.Settings.Data.PuppetOpacity, 30, 100), SmallChange = 5, LargeChange = 10, ToolTip = "See-through: how solid this window is", Focusable = false };
        op.ValueChanged += (_, e) => { Opacity = e.NewValue / 100.0; app.Settings.Data.PuppetOpacity = (int)e.NewValue; };
        op.PreviewMouseUp += (_, _) => app.Settings.Save();
        opRow.Children.Add(opLabel); opRow.Children.Add(op);
        root.Children.Add(opRow);

        return new Border { Background = Bg, CornerRadius = new CornerRadius(8), BorderBrush = Bg3, BorderThickness = new Thickness(1), Child = root };
    }

    void SetMap(bool on)
    {
        mapOn = on;
        mapBox.Visibility = on ? Visibility.Visible : Visibility.Collapsed;
        Lit(mapB, on);
        if (on) _ = Refresh();
    }

    void Note(string t) { stateText.Text = t; noteUntil = DateTime.Now.AddSeconds(4); stateText.ToolTip = t; }

    // ---------- moving ----------
    void Send(string action)
    {
        if (!bot.Running) { Note("the bot is not online"); return; }
        var task = bot.RunCommand("CompanionMove", new[] { action, action is "stop" or "run" or "walk" or "fly" or "land" or "stand" ? "0" : "450" });
        task.ContinueWith(r => { if (!r.Result.Ok) Dispatcher.BeginInvoke(() => Note(r.Result.Reply ?? "failed")); }, TaskContinuationOptions.OnlyOnRanToCompletion);
    }

    void Hold(string action)
    {
        if (holds.ContainsKey(action)) return;
        Send(action);
        var t = new DispatcherTimer { Interval = TimeSpan.FromMilliseconds(250) };
        t.Tick += (_, _) => Send(action);
        t.Start();
        holds[action] = t;
        if (padButtons.TryGetValue(action, out var b)) Lit(b, true);
    }

    void Release(string action)
    {
        if (!holds.TryGetValue(action, out var t)) return;
        t.Stop(); holds.Remove(action);
        if (padButtons.TryGetValue(action, out var b)) Lit(b, false);
        if (holds.Count == 0) Send("stop");
    }

    void ReleaseAll() { foreach (var a in holds.Keys.ToList()) Release(a); }

    void ToggleFly()
    {
        if (DateTime.Now >= ownStateUntil && bot.Status is JsonNode st) flyOn = st["flying"]?.GetValue<bool>() == true;
        flyOn = !flyOn; Lit(flyB, flyOn); Send(flyOn ? "fly" : "land"); ownStateUntil = DateTime.Now.AddSeconds(5);
    }

    static string? KeyAction(Key k, bool shift) => k switch
    {
        Key.W or Key.Up => "forward",
        Key.S or Key.Down => "back",
        Key.Left => shift ? "left" : "turnleft",
        Key.Right => shift ? "right" : "turnright",
        Key.A => "turnleft",
        Key.D => "turnright",
        Key.Q => "left",
        Key.E => "right",
        Key.R or Key.PageUp => "up",
        Key.C or Key.PageDown => "down",
        _ => null,
    };

    void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.Key == Key.Space) { e.Handled = true; ReleaseAll(); Send("stop"); return; }
        if (e.Key == Key.F) { e.Handled = true; if (!e.IsRepeat) ToggleFly(); return; }
        if (e.Key == Key.Escape) { e.Handled = true; ReleaseAll(); return; }
        var a = KeyAction(e.Key, Keyboard.Modifiers.HasFlag(ModifierKeys.Shift));
        if (a == null) return;
        e.Handled = true;
        if (e.IsRepeat) return;
        keysDown[e.Key] = a;
        Hold(a);
    }

    void OnKeyUp(object sender, KeyEventArgs e)
    {
        if (!keysDown.TryGetValue(e.Key, out var a)) return;
        e.Handled = true;
        keysDown.Remove(e.Key);
        if (!keysDown.ContainsValue(a)) Release(a);
    }

    // ---------- the HUD's camera ----------
    async Task ToggleCam()
    {
        string you = bot.Profile.Masters.FirstOrDefault() ?? "";      // the first person in the bot's list is the app's user
        if (you == "") { Note("add yourself under \"Who may command it\""); return; }
        if (!bot.Running) { Note("the bot is not online"); return; }
        bool on = !camOn;
        var r = await bot.RunCommand("CompanionHudCam", new[] { you, on ? "on" : "off" });
        if (!r.Ok) { Note(r.Reply ?? "cam failed"); return; }
        camOn = on; Lit(camB, on);
        Note(on ? "cam on in your HUD" : "cam off");
    }

    // ---------- state and map ----------
    JsonObject? lastView;

    async Task Refresh()
    {
        var st = bot.Status;
        bool online = bot.State == "online" && st?["online"]?.GetValue<bool>() == true;
        if (DateTime.Now > noteUntil)
            stateText.Text = !online ? (bot.State == "online" ? "…" : bot.State) : st!["sitting"]?.GetValue<bool>() == true ? "sitting" : st["flying"]?.GetValue<bool>() == true ? "flying" : "standing";
        if (online)
        {
            standB.IsEnabled = st!["sitting"]?.GetValue<bool>() == true;
            if (holds.Count == 0 && DateTime.Now >= ownStateUntil)
            {
                bool f = st["flying"]?.GetValue<bool>() == true; if (f != flyOn) { flyOn = f; Lit(flyB, f); }
                bool rn = st["running"]?.GetValue<bool>() == true; if (rn != runOn) { runOn = rn; Lit(runB, rn); }
            }
        }
        if (!mapOn || !IsVisible) return;
        if (!bot.Running) { lastView = null; DrawMap(null); return; }
        try
        {
            var stq = bot.RunCommand("CompanionStatus", Array.Empty<string>());
            var rad = bot.RunCommand("CompanionRadar", Array.Empty<string>());
            await Task.WhenAll(stq, rad);
            lastView = new JsonObject
            {
                ["status"] = stq.Result.Ok && stq.Result.Reply is string ss ? JsonNode.Parse(ss) : null,
                ["radar"] = rad.Result.Ok && rad.Result.Reply is string rs ? JsonNode.Parse(rs) : new JsonArray(),
            };
            var s2 = lastView["status"];
            if (s2?["online"]?.GetValue<bool>() == true)
            {
                whereText.Text = $"{s2["region"]} ({Math.Round(s2["x"]!.GetValue<double>())}, {Math.Round(s2["y"]!.GetValue<double>())}, {Math.Round(s2["z"]!.GetValue<double>())})";
                long cx = (long)s2["cornerX"]!.GetValue<double>(), cy = (long)s2["cornerY"]!.GetValue<double>();
                string key = cx + "-" + cy;
                if (key != tileKey && (bot.Profile.Grid == "sl" || bot.Profile.Grid == ""))
                {
                    tileKey = key; tile = null;
                    var bytes = await MapTiles.GetBytes(cx, cy);
                    if (bytes != null && tileKey == key)
                    {
                        var bi = new BitmapImage();
                        bi.BeginInit(); bi.CacheOption = BitmapCacheOption.OnLoad; bi.StreamSource = new System.IO.MemoryStream(bytes); bi.EndInit(); bi.Freeze();
                        tile = bi;
                    }
                }
            }
        }
        catch (Exception e) { Log.Info("Puppet map: " + e.Message); }
        DrawMap(lastView);
    }

    void DrawMap(JsonObject? v)
    {
        map.Children.Clear();
        double W = map.Width;
        var st = v?["status"];
        if (st?["online"]?.GetValue<bool>() != true)
        {
            var t = new TextBlock { Text = "The bot is not online.", Foreground = Fg2, FontSize = 12 };
            Canvas.SetLeft(t, 50); Canvas.SetTop(t, W / 2 - 8); map.Children.Add(t);
            return;
        }
        double bx = st["x"]!.GetValue<double>(), by = st["y"]!.GetValue<double>();
        double span = zoom.SelectedItem is ComboBoxItem ci && ci.Tag is int z ? z : 96;
        double cx = span >= 256 ? 128 : bx, cy = span >= 256 ? 128 : by, s = W / span;
        double PX(double x) => (x - cx) * s + W / 2;
        double PY(double y) => W / 2 - (y - cy) * s;      // north up
        if (tile != null)
        {
            var img = new Image { Source = tile, Width = 256 * s, Height = 256 * s, Stretch = Stretch.Fill };
            Canvas.SetLeft(img, PX(0)); Canvas.SetTop(img, PY(256)); map.Children.Add(img);
        }
        else
        {
            var grid = new SolidColorBrush(Color.FromArgb(0x16, 0xFF, 0xFF, 0xFF));
            for (int m = 0; m <= 256; m += 16)
            {
                map.Children.Add(new Line { X1 = PX(m), Y1 = PY(0), X2 = PX(m), Y2 = PY(256), Stroke = grid });
                map.Children.Add(new Line { X1 = PX(0), Y1 = PY(m), X2 = PX(256), Y2 = PY(m), Stroke = grid });
            }
        }
        var edge = new Rectangle { Width = 256 * s, Height = 256 * s, Stroke = new SolidColorBrush(Color.FromArgb(0x99, 0xB0, 0xDC, 0xFF)) };
        Canvas.SetLeft(edge, PX(0)); Canvas.SetTop(edge, PY(256)); map.Children.Add(edge);
        var chat = new Ellipse { Width = 40 * s, Height = 40 * s, Stroke = new SolidColorBrush(Color.FromArgb(0x8C, 0x8F, 0xE3, 0xA7)), StrokeDashArray = new DoubleCollection { 4, 4 } };
        Canvas.SetLeft(chat, PX(bx) - 20 * s); Canvas.SetTop(chat, PY(by) - 20 * s); map.Children.Add(chat);
        string region = st["region"]?.ToString() ?? "";
        foreach (var a in v!["radar"] as JsonArray ?? new JsonArray())
        {
            if (a?["region"]?.ToString() != region) continue;
            double ax = a["x"]!.GetValue<double>(), ay = a["y"]!.GetValue<double>(), d = a["dist"]?.GetValue<double>() ?? 99;
            var dot = new Ellipse { Width = 7, Height = 7, Fill = d <= 20 ? new SolidColorBrush(Color.FromRgb(0x8F, 0xE3, 0xA7)) : new SolidColorBrush(Color.FromRgb(0xFF, 0xD3, 0x7A)) };
            Canvas.SetLeft(dot, PX(ax) - 3.5); Canvas.SetTop(dot, PY(ay) - 3.5); map.Children.Add(dot);
            if (span < 256 || d <= 40)
            {
                var n = new TextBlock { Text = (a["name"]?.ToString() ?? "").Replace(" Resident", ""), Foreground = Fg, FontSize = 10 };
                Canvas.SetLeft(n, PX(ax) + 5); Canvas.SetTop(n, PY(ay) - 7); map.Children.Add(n);
            }
        }
        // the bot: an arrow pointing where it looks (heading 0 = east, counter-clockwise)
        double h = (st["heading"]?.GetValue<double>() ?? 0) * Math.PI / 180;
        Point P(double fx, double fy) => new(PX(bx) + fx * Math.Cos(h) - fy * Math.Sin(h), PY(by) - (fx * Math.Sin(h) + fy * Math.Cos(h)));
        var arrow = new Polygon { Fill = Acc, Stroke = OnAcc, StrokeThickness = 1.2, Points = new PointCollection { P(10, 0), P(-6, 6), P(-3, 0), P(-6, -6) } };
        map.Children.Add(arrow);
    }
}
