using System.Net.Http;

namespace AvieBoter.UI;

/// <summary>Second Life's map picture of one region (256 m square, from the grid's public map server), as a data URL
/// for the Puppeteer. Kept for the session; null when it cannot be fetched (OpenSim grids, no connection).</summary>
public static class MapTiles
{
    static readonly HttpClient http = new() { Timeout = TimeSpan.FromSeconds(15) };
    static readonly Dictionary<string, byte[]?> cache = new();

    public static async Task<string?> Get(long cornerX, long cornerY)
    {
        var b = await GetBytes(cornerX, cornerY);
        return b == null ? null : "data:image/jpeg;base64," + Convert.ToBase64String(b);
    }

    public static async Task<byte[]?> GetBytes(long cornerX, long cornerY)
    {
        string key = cornerX / 256 + "-" + cornerY / 256;
        lock (cache) if (cache.TryGetValue(key, out var hit)) return hit;
        byte[]? bytes = null;
        try { bytes = await http.GetByteArrayAsync("https://secondlife-maps-cdn.akamaized.net/map-1-" + key + "-objects.jpg"); }
        catch (Exception e) { AvieBoter.Core.Log.Info("Map tile " + key + ": " + e.Message); }
        lock (cache) cache[key] = bytes;
        return bytes;
    }
}
