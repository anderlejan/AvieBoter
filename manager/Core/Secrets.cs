using System.Security.Cryptography;
using System.Text;

namespace AvieBoter.Core;

/// <summary>Passwords are encrypted for the current Windows user (DPAPI); only the bot process gets the plain text,
/// through its environment, never a file.</summary>
public static class Secrets
{
    static readonly byte[] Entropy = Encoding.UTF8.GetBytes("AvieBoter.v1");
    public static string Protect(string plain) =>
        Convert.ToBase64String(ProtectedData.Protect(Encoding.UTF8.GetBytes(plain), Entropy, DataProtectionScope.CurrentUser));
    public static string Unprotect(string b64) =>
        string.IsNullOrEmpty(b64) ? "" : Encoding.UTF8.GetString(ProtectedData.Unprotect(Convert.FromBase64String(b64), Entropy, DataProtectionScope.CurrentUser));

    public static string NewSecret(int len = 24)
    {
        const string abc = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
        var b = RandomNumberGenerator.GetBytes(len);
        return new string(b.Select(x => abc[x % abc.Length]).ToArray());
    }

    public static string Sha1Hex(string s) =>
        Convert.ToHexString(SHA1.HashData(Encoding.UTF8.GetBytes(s))).ToLowerInvariant();
}
