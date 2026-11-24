# Third-party notices

AvieBoter's own code is licensed under the GNU General Public License v3.0 or later (see `LICENSE`). The installer
also contains the following components, each under its own licence. Their source code is available from the
links below; it is not copied into this repository.

## SecondBot
- https://github.com/Madpeterz/SecondBot – by Madpeterz, GNU General Public License v3.0.
- AvieBoter runs SecondBot (`SecondBotEvents`) at the commit in `bot/UPSTREAM_COMMIT`, changed by
  `bot/avieboter.patch` (in this repository). The patched program is in the installer's `bot` folder.

## LibreMetaverse
- https://github.com/cinderblocks/libremetaverse – included in SecondBot's source tree.
- Licence (BSD 3-Clause):

```
Copyright (c) 2006-2016, openmetaverse.co
All rights reserved.

- Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

- Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
- Neither the name of the openmetaverse.co nor the names
  of its contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT OWNER OR CONTRIBUTORS BE
LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
POSSIBILITY OF SUCH DAMAGE.
```

## Libraries used by SecondBot (NuGet packages, in the `bot` folder)
| Package | Licence | Source |
|---|---|---|
| Discord.Net | MIT | https://github.com/discord-net/Discord.Net |
| EmbedIO | MIT | https://github.com/unosquare/embedio |
| MailKit / MimeKit | MIT | https://github.com/jstedfast/MailKit |
| NRedisStack / StackExchange.Redis | MIT | https://github.com/redis/NRedisStack |
| RabbitMQ.Client | Apache-2.0 / MPL-2.0 | https://github.com/rabbitmq/rabbitmq-dotnet-client |
| RestSharp | Apache-2.0 | https://github.com/restsharp/RestSharp |
| Betalgo.Ranul.OpenAI | MIT | https://github.com/betalgo/openai |

Their exact versions and further dependencies are listed in SecondBot's project file and in
`bot\SecondBotEvents.deps.json` of an installed copy.

## Used by the app
| Component | Licence | Source |
|---|---|---|
| .NET runtime and WPF / Windows Forms (self-contained) | MIT | https://github.com/dotnet/runtime |
| Microsoft.Web.WebView2 (SDK) | Microsoft WebView2 SDK licence (BSD-style) | https://www.nuget.org/packages/Microsoft.Web.WebView2 |
| System.Security.Cryptography.ProtectedData | MIT | https://github.com/dotnet/runtime |
| Microsoft Edge WebView2 Runtime (installed by the installer only when missing) | Microsoft | https://developer.microsoft.com/microsoft-edge/webview2/ |

The installer is made with [Inno Setup](https://jrsoftware.org/isinfo.php).

## Trademarks
Second Life is a trademark of Linden Research, Inc. AvieBoter is not affiliated with or endorsed by Linden Lab.
OpenSimulator is a project of its own contributors; AvieBoter is not part of it.
