# ---- build ----
FROM mcr.microsoft.com/dotnet/sdk:8.0-alpine AS build
WORKDIR /src

COPY Uc10.sln ./
COPY src/Uc10.Api/Uc10.Api.csproj            src/Uc10.Api/
COPY src/Uc10.Application/Uc10.Application.csproj src/Uc10.Application/
COPY src/Uc10.Domain/Uc10.Domain.csproj      src/Uc10.Domain/
COPY src/Uc10.Infrastructure/Uc10.Infrastructure.csproj src/Uc10.Infrastructure/
COPY tests/Uc10.Tests/Uc10.Tests.csproj      tests/Uc10.Tests/
RUN dotnet restore Uc10.sln

COPY . .
RUN dotnet publish src/Uc10.Api/Uc10.Api.csproj -c Release -o /app/publish --no-restore

# ---- runtime ----
FROM mcr.microsoft.com/dotnet/aspnet:8.0-alpine AS runtime
WORKDIR /app
# The aspnet:8.0-alpine image already ships with a non-root `app` user.
# We install:
#   - wget  → HEALTHCHECK probes /health
#   - icu-libs + icu-data-full → named cultures ("en-IN" INR formatting, etc.);
#     without these, globalization-invariant mode is active and
#     CultureInfo.GetCultureInfo("en-IN") throws.
#   - tzdata → correct local-time conversions in logs + date comparisons.
RUN apk add --no-cache wget icu-libs icu-data-full tzdata \
 && mkdir -p /app/uploads && chown -R app:app /app

# Flip globalization-invariant mode OFF now that ICU is present. (The alpine
# image sets it to true; we override here, after the apk add.)
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

USER app

COPY --from=build /app/publish .
COPY --from=build /src/prompts ./prompts

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=10 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

ENTRYPOINT ["dotnet", "Uc10.Api.dll"]
