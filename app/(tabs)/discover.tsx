
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Image,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { socialService, Post } from '@/services/socialService';
import { IconSymbol } from '@/components/IconSymbol';
import Dialog from '@/components/Dialog';
import * as Haptics from 'expo-haptics';
import { getTimeAgo } from '@/utils/timeUtils';
import Share from 'react-native-share';
import { formatPostShareOptions } from '@/utils/share';

export default function DiscoverScreen() {
  const router = useRouter();
  const { currentColors, showToast } = useApp();
  const { isAuthenticated } = useAuth();
  const [loginDialogVisible, setLoginDialogVisible] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (!isAuthenticated) {
        setLoginDialogVisible(true);
      }
    }, [isAuthenticated])
  );

  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const LIMIT = 20;

  const loadPosts = useCallback(async (refresh = false) => {
    try {
      const currentOffset = refresh ? 0 : offset;
      const { data, error } = await socialService.getDiscoveryFeed(LIMIT, currentOffset);

      if (error) {
        console.error('Error loading posts:', error);
        showToast('Failed to load posts', 'error');
        return;
      }

      if (data) {
        if (refresh) {
          setPosts(data);
          setOffset(LIMIT);
        } else {
          setPosts((prev) => [...prev, ...data]);
          setOffset((prev) => prev + LIMIT);
        }
      }
    } catch (error) {
      console.error('Error loading posts:', error);
      showToast('Failed to load posts', 'error');
    } finally {
      setLoading(false);
      setRefreshing(false);
      setLoadingMore(false);
    }
  }, [offset, showToast]);

  useEffect(() => {
    loadPosts(true);
  }, []);

  const handleRefresh = () => {
    setRefreshing(true);
    loadPosts(true);
  };

  const handleLoadMore = () => {
    if (!loadingMore && posts.length >= LIMIT) {
      setLoadingMore(true);
      loadPosts(false);
    }
  };

  const handleLike = async (postId: string, isLiked: boolean) => {
    if (!isAuthenticated) {
      showToast('Please sign in to like posts', 'info');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      if (isLiked) {
        await socialService.unlikePost(postId);
      } else {
        await socialService.likePost(postId);
      }

      // Update local state
      setPosts((prev) =>
        prev.map((post) =>
          post.id === postId
            ? {
                ...post,
                isLikedByCurrentUser: !isLiked,
                likesCount: isLiked ? post.likesCount - 1 : post.likesCount + 1,
              }
            : post
        )
      );
    } catch (error) {
      console.error('Error toggling like:', error);
      showToast('Failed to update like', 'error');
    }
  };

  const handleComment = (postId: string) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    router.push(`/post-detail?postId=${postId}`);
  };

  const handleShare = async (post: Post) => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Show loading toast while preparing share
      showToast('Preparing to share...', 'info');
      
      // Use the new share utility to format the share message with deep links
      // This now downloads the image locally first
      const shareOptions = formatPostShareOptions(
        post.user?.name || 'Jagabans L.A.',
        post.caption || '',
        post.id,
        post.imageUrl
      );
      
      await Share.open(shareOptions);
      
      console.log('Post shared successfully with image and clickable links');
    } catch (error: any) {
      if (error?.message !== 'User did not share') {
        console.error('Share error:', error);
        showToast('Failed to share post', 'error');
      }
    }
  };

  const handleCreatePost = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    if (!isAuthenticated) {
      showToast('Please sign in to create posts', 'info');
      return;
    }
    router.push('/create-post');
  };

  const renderPost = ({ item }: { item: Post }) => (
    <View style={styles.postCardWrapper}>
      <LinearGradient
        colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.postCard, { borderColor: currentColors.border }]}
      >
        {/* Decorative corner accents */}
        <View style={[styles.cornerAccent, styles.cornerTopLeft, { borderColor: currentColors.secondary }]} />
        <View style={[styles.cornerAccent, styles.cornerTopRight, { borderColor: currentColors.secondary }]} />
        <View style={[styles.cornerAccent, styles.cornerBottomLeft, { borderColor: currentColors.secondary }]} />
        <View style={[styles.cornerAccent, styles.cornerBottomRight, { borderColor: currentColors.secondary }]} />

        {/* Post Image with overlay gradient and user info */}
        <TouchableOpacity onPress={() => handleComment(item.id)} activeOpacity={0.95}>
          <View style={styles.imageContainer}>
            <Image source={{ uri: item.imageUrl }} style={styles.postImage} />
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.7)']}
              style={styles.imageOverlay}
            />
            
            {/* User Info Overlay */}
            <View style={styles.userInfoOverlay}>
              <View style={styles.userInfo}>
                <View style={[styles.avatarContainer, { borderColor: currentColors.secondary }]}>
                  {item.user?.profileImage ? (
                    <Image source={{ uri: item.user.profileImage }} style={styles.avatar} />
                  ) : (
                    <LinearGradient
                      colors={[currentColors.secondary, currentColors.highlight]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.avatar}
                    >
                      <IconSymbol
                        name="person.fill"
                        // android_material_icon_name="person"
                        size={20}
                        color={currentColors.background}
                      />
                    </LinearGradient>
                  )}
                </View>
                <View style={styles.userDetails}>
                  <Text style={[styles.userName, { color: '#FFFFFF' }]}>
                    {item.user?.name || 'Unknown User'}
                  </Text>
                  {item.locationVerified && (
                    <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                      <IconSymbol
                        name="checkmark.seal.fill"
                        // android_material_icon_name="check-circle"
                        size={13}
                        color={currentColors.secondary}
                      />
                      <Text style={[styles.verifiedText, { color: '#FFFFFF' }]}>
                        Taken at Jagabans L.A.
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          </View>
        </TouchableOpacity>

        {/* Post Actions with enhanced styling */}
        <View style={[styles.postActions, { borderTopColor: `${currentColors.border}40` }]}>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleLike(item.id, item.isLikedByCurrentUser || false)}
            activeOpacity={0.7}
          >
            <View style={[
              styles.actionIconWrapper,
              item.isLikedByCurrentUser && { backgroundColor: '#FF3B3015' }
            ]}>
              <IconSymbol
                name={item.isLikedByCurrentUser ? 'heart.fill' : 'heart'}
                // android_material_icon_name={item.isLikedByCurrentUser ? 'favorite' : 'favorite-border'}
                size={22}
                color={item.isLikedByCurrentUser ? '#FF3B30' : currentColors.text}
              />
            </View>
            <Text style={[styles.actionText, { color: currentColors.text }]}>
              {item.likesCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => handleComment(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconWrapper}>
              <IconSymbol
                name="message"
                // android_material_icon_name="chat"
                size={22}
                color={currentColors.text}
              />
            </View>
            <Text style={[styles.actionText, { color: currentColors.text }]}>
              {item.commentsCount}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={() => handleShare(item)}
            activeOpacity={0.7}
          >
            <View style={styles.actionIconWrapper}>
              <IconSymbol
                name="square.and.arrow.up"
                // android_material_icon_name="share"
                size={22}
                color={currentColors.text}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Caption with refined typography */}
        {item.caption && (
          <View style={styles.captionContainer}>
            <Text style={[styles.caption, { color: currentColors.text }]}>
              <Text style={[styles.captionUsername, { color: currentColors.text }]}>
                {item.user?.name || 'User'}
              </Text>
              <Text style={[styles.captionText, { color: currentColors.textSecondary }]}>
                {' '}{item.caption}
              </Text>
            </Text>
          </View>
        )}

        {/* Location Info */}
        {(item.ipAddress || item.locationCity) && (
          <View style={[styles.locationInfoContainer, { borderTopColor: `${currentColors.border}20` }]}>
            {item.ipAddress && (
              <Text style={[styles.locationInfoText, { color: currentColors.textSecondary }]}>
                📍 IP: {item.ipAddress}
              </Text>
            )}
            {item.locationCity && (
              <Text style={[styles.locationInfoText, { color: currentColors.textSecondary }]}>
                🌍 {item.locationCity}
                {item.locationState && `, ${item.locationState}`}
                {item.locationCountry && `, ${item.locationCountry}`}
              </Text>
            )}
          </View>
        )}

        {/* Timestamp with divider */}
        <View style={[styles.timestampContainer, { borderTopColor: `${currentColors.border}20` }]}>
          <Text style={[styles.timestamp, { color: currentColors.textSecondary }]}>
            {getTimeAgo(item.createdAt)}
          </Text>
        </View>
      </LinearGradient>
    </View>
  );

  if (loading) {
    return (
      <LinearGradient
        colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.gradientContainer}
      >
        <SafeAreaView style={styles.safeArea} edges={['top']}>
          <LinearGradient
            colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.header, { borderBottomColor: currentColors.border }]}
          >
            <View>
              <Text style={[styles.headerTitle, { color: currentColors.text }]}>Discover</Text>
              <View style={[styles.headerUnderline, { backgroundColor: currentColors.secondary }]} />
            </View>
            <TouchableOpacity onPress={handleCreatePost} style={[styles.createButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}>
              <IconSymbol
                name="camera.fill"
                // android_material_icon_name="camera"
                size={24}
                color={currentColors.secondary}
              />
            </TouchableOpacity>
          </LinearGradient>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={currentColors.secondary} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient
      colors={[currentColors.gradientStart || currentColors.background, currentColors.gradientMid || currentColors.background, currentColors.gradientEnd || currentColors.background]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0, y: 1 }}
      style={styles.gradientContainer}
    >
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        {/* Enhanced Header */}
        <LinearGradient
          colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { borderBottomColor: currentColors.border }]}
        >
          <View>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Discover</Text>
            <View style={[styles.headerUnderline, { backgroundColor: currentColors.secondary }]} />
          </View>
          <TouchableOpacity onPress={handleCreatePost} style={[styles.createButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}>
            <IconSymbol
              name="camera.fill"
              // android_material_icon_name="camera"
              size={24}
              color={currentColors.secondary}
            />
          </TouchableOpacity>
        </LinearGradient>

        {/* Posts Feed */}
        <FlatList
          data={posts}
          renderItem={renderPost}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={currentColors.secondary}
            />
          }
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator size="small" color={currentColors.secondary} />
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIconWrapper, { borderColor: currentColors.border }]}>
                <IconSymbol
                  name="photo.on.rectangle"
                  // android_material_icon_name="photo"
                  size={64}
                  color={currentColors.textSecondary}
                />
              </View>
              <Text style={[styles.emptyTitle, { color: currentColors.text }]}>
                No posts yet
              </Text>
              <Text style={[styles.emptyText, { color: currentColors.textSecondary }]}>
                Be the first to share your experience!
              </Text>
              <LinearGradient
                colors={[currentColors.secondary, currentColors.highlight]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.emptyButton}
              >
                <TouchableOpacity
                  style={styles.emptyButtonInner}
                  onPress={handleCreatePost}
                  activeOpacity={0.8}
                >
                  <IconSymbol
                    name="plus.circle.fill"
                    // android_material_icon_name="add-circle"
                    size={20}
                    color={currentColors.background}
                  />
                  <Text style={[styles.emptyButtonText, { color: currentColors.background }]}>
                    Create Post
                  </Text>
                </TouchableOpacity>
              </LinearGradient>
            </View>
          }
        />
      </SafeAreaView>
      <Dialog
        visible={loginDialogVisible}
        title="Sign In Required"
        message="Please sign in to access Discover."
        buttons={[
          { text: 'Cancel', onPress: () => router.back(), style: 'cancel' },
          { text: 'Sign In', onPress: () => router.replace('/(tabs)/profile'), style: 'default' },
        ]}
        onHide={() => setLoginDialogVisible(false)}
        currentColors={currentColors}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradientContainer: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 24,
    borderBottomWidth: 2,
    boxShadow: '0px 6px 20px rgba(74, 215, 194, 0.3)',
    elevation: 8,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  headerUnderline: {
    height: 3,
    width: 60,
    marginTop: 6,
    opacity: 0.8,
  },
  createButton: {
    width: 44,
    height: 44,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  postCardWrapper: {
    marginBottom: 24,
  },
  postCard: {
    borderRadius: 0,
    overflow: 'hidden',
    borderWidth: 2,
    boxShadow: '0px 8px 24px rgba(212, 175, 55, 0.3)',
    elevation: 8,
    position: 'relative',
  },
  cornerAccent: {
    position: 'absolute',
    width: 16,
    height: 16,
    borderWidth: 2,
    zIndex: 10,
  },
  cornerTopLeft: {
    top: -1,
    left: -1,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  cornerTopRight: {
    top: -1,
    right: -1,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  cornerBottomLeft: {
    bottom: -1,
    left: -1,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  cornerBottomRight: {
    bottom: -1,
    right: -1,
    borderLeftWidth: 0,
    borderTopWidth: 0,
  },
  userInfoOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 16,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarContainer: {
    borderWidth: 2,
    borderRadius: 22,
    padding: 2,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  userDetails: {
    flex: 1,
    marginLeft: 12,
  },
  userName: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  verifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    alignSelf: 'flex-start',
  },
  verifiedText: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    marginLeft: 4,
    letterSpacing: 0.3,
  },
  imageContainer: {
    position: 'relative',
  },
  postImage: {
    width: '100%',
    height: 400,
    resizeMode: 'cover',
  },
  imageOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 120,
  },
  postActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 20,
  },
  actionIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionText: {
    fontSize: 15,
    fontFamily: 'Inter_600SemiBold',
    marginLeft: 8,
    letterSpacing: 0.3,
  },
  captionContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  caption: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 22,
  },
  captionUsername: {
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.2,
  },
  captionText: {
    letterSpacing: 0.1,
  },
  locationInfoContainer: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
  },
  locationInfoText: {
    fontSize: 11,
    fontFamily: 'Inter_400Regular',
    marginBottom: 2,
  },
  timestampContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
  },
  timestamp: {
    fontSize: 11,
    fontFamily: 'Inter_500Medium',
    letterSpacing: 0.5,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 80,
    paddingHorizontal: 40,
  },
  emptyIconWrapper: {
    width: 120,
    height: 120,
    borderRadius: 60,
    borderWidth: 2,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
  },
  emptyTitle: {
    fontSize: 22,
    fontFamily: 'PlayfairDisplay_700Bold',
    marginBottom: 8,
    letterSpacing: 0.5,
  },
  emptyText: {
    fontSize: 15,
    fontFamily: 'Inter_400Regular',
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
  },
  emptyButton: {
    borderRadius: 0,
    boxShadow: '0px 8px 24px rgba(74, 215, 194, 0.4)',
    elevation: 8,
  },
  emptyButtonInner: {
    paddingHorizontal: 28,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  emptyButtonText: {
    fontSize: 16,
    fontFamily: 'Inter_600SemiBold',
    letterSpacing: 0.5,
  },
});
