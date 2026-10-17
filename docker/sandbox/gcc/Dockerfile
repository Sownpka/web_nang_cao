# Sandbox image for compiling and running C++17 submissions (GCC 13).
# The worker compiles in one container and runs the binary in fresh ones, all read-only as nobody with
# no network. The binary arrives over stdin into the small exec-enabled tmpfs /box; /tmp stays noexec.
FROM alpine:3.20
RUN apk add --no-cache g++
# Precompile <bits/stdc++.h> with the judge's exact flags: it cuts a typical compile from ~5s to ~1.5s
# at half a CPU. GCC only uses it when the flags match, so it never changes behaviour.
RUN for h in /usr/include/c++/*/*/bits/stdc++.h; do g++ -O2 -std=c++17 -x c++-header "$h" -o "$h.gch"; done
WORKDIR /tmp
USER 65534:65534
