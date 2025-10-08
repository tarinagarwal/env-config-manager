{{/*
Expand the name of the chart.
*/}}
{{- define "env-config-manager.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "env-config-manager.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Create chart name and version as used by the chart label.
*/}}
{{- define "env-config-manager.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels
*/}}
{{- define "env-config-manager.labels" -}}
helm.sh/chart: {{ include "env-config-manager.chart" . }}
{{ include "env-config-manager.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels
*/}}
{{- define "env-config-manager.selectorLabels" -}}
app.kubernetes.io/name: {{ include "env-config-manager.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Create the name of the service account to use
*/}}
{{- define "env-config-manager.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "env-config-manager.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
MongoDB connection string
*/}}
{{- define "env-config-manager.mongodbUrl" -}}
{{- if .Values.mongodb.external.enabled }}
{{- printf "mongodb://%s:%s@%s:%d/%s?authSource=admin" .Values.mongodb.external.username .Values.mongodb.external.password .Values.mongodb.external.host (.Values.mongodb.external.port | int) .Values.mongodb.external.database }}
{{- else }}
{{- printf "mongodb://%s:$(MONGO_ROOT_PASSWORD)@%s-mongodb:27017/%s?authSource=admin" .Values.mongodb.auth.rootUser (include "env-config-manager.fullname" .) .Values.mongodb.auth.database }}
{{- end }}
{{- end }}

{{/*
Redis URL
*/}}
{{- define "env-config-manager.redisUrl" -}}
{{- if .Values.redis.external.enabled }}
{{- printf "redis://:%s@%s:%d" .Values.redis.external.password .Values.redis.external.host (.Values.redis.external.port | int) }}
{{- else }}
{{- printf "redis://:$(REDIS_PASSWORD)@%s-redis-master:6379" (include "env-config-manager.fullname" .) }}
{{- end }}
{{- end }}
