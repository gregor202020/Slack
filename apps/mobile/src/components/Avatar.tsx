/**
 * Avatar — circular image with fallback initials.
 *
 * If `imageUrl` is provided and loads successfully, displays the image.
 * Otherwise, renders the user's initials on a brand-colored background.
 */

import React, { useState } from 'react'
import { View, Image, Text, StyleSheet } from 'react-native'
import { colors } from '../theme/colors'
import { fontWeight } from '../theme/typography'

interface AvatarProps {
  imageUrl?: string | null
  name?: string | null
  size?: number
}

function getInitials(name?: string | null): string {
  if (!name) return '?'
  const parts = name.trim().split(/\s+/)
  if (parts.length === 1) return parts[0]![0]!.toUpperCase()
  return (parts[0]![0]! + parts[parts.length - 1]![0]!).toUpperCase()
}

/** Generate a deterministic background color based on the name. */
function getBackgroundColor(name?: string | null): string {
  const palette = [
    colors.brand[500],
    colors.accent[500],
    colors.brand[300],
    colors.accent[300],
    colors.brand[700],
    colors.accent[700],
    '#6366F1',
    '#8B5CF6',
    '#EC4899',
    '#14B8A6',
  ]

  if (!name) return palette[0]!
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return palette[Math.abs(hash) % palette.length]!
}

export function Avatar({ imageUrl, name, size = 40 }: AvatarProps) {
  const [imageError, setImageError] = useState(false)
  const showImage = imageUrl && !imageError
  const initials = getInitials(name)
  const bgColor = getBackgroundColor(name)

  const containerStyle = {
    width: size,
    height: size,
    borderRadius: size / 2,
  }

  const fontSizeValue = Math.round(size * 0.38)

  if (showImage) {
    return (
      <Image
        source={{ uri: imageUrl }}
        style={[styles.image, containerStyle]}
        onError={() => setImageError(true)}
      />
    )
  }

  return (
    <View style={[styles.fallback, containerStyle, { backgroundColor: bgColor }]}>
      <Text
        style={[
          styles.initials,
          { fontSize: fontSizeValue, lineHeight: fontSizeValue * 1.2 },
        ]}
      >
        {initials}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  image: {
    resizeMode: 'cover',
  },
  fallback: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    color: colors.white,
    fontWeight: fontWeight.semibold,
  },
})
