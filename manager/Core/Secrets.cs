using System.Security.Cryptography;
using System.Text;

namespace AvieBoter.Core;

/// <summary>Passwords are encrypted for the current Windows user (DPAPI); only the bot process gets the plain text,
/// through its environment, never a file.</summary>
public static class Secrets
{
    // The DPAPI entropy is part of every stored password: it keeps the value it had under the app's former name
    // (SL Bot Manager), so saved passwords stay readable. 1.0.1 used "AvieBoter.v1": still read as a fallback.
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("SLBotManager.v1");
    static readonly byte[] Entropy101 = Encoding.UTF8.GetBytes("AvieBoter.v1");
    public static string Protect(string plain) =>
        Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.CurrentUser));
    public static string Unprotect(string b64)
    {
        if (string.IsNullOrEmpty(b64)) return "";
        var data = Convert.FromBase64String(b64);
        try { return Encoding.UTF8.GetString(ProtectedData.Unprotect(data, Entropy, DataProtectionScope.CurrentUser)); }
        catch (CryptographicException) { return Encoding.UTF8.GetString(ProtectedData.Unprotect(data, Entropy101, DataProtectionScope.CurrentUser)); }
    }

    public static string NewSecret(int len = 24)
    {
        const string abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        var b = RandomNumberGenerator.GetBytes(len);
        return new string(b.Select(x => abc[x % abc.Length]).ToArray());
    }

    public static string Sha1Hex(string s) =>
        Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();
}
