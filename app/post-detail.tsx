
import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useApp } from '@/contexts/AppContext';
import { useAuth } from '@/contexts/AuthContext';
import { socialService, Post, Comment } from '@/services/socialService';
import { IconSymbol } from '@/components/IconSymbol';
import * as Haptics from 'expo-haptics';
import { getTimeAgo } from '@/utils/timeUtils';
import Share from 'react-native-share';
import { formatPostShareOptions } from '@/utils/share';

export default function PostDetailScreen() {
  const router = useRouter();
  const { postId } = useLocalSearchParams<{ postId: string }>();
  const { currentColors, showToast } = useApp();
  const { isAuthenticated, user } = useAuth();
  const [post, setPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [commentText, setCommentText] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);

  useEffect(() => {
    if (postId) {
      loadPostDetails();
    }
  }, [postId]);

  const loadPostDetails = async () => {
    try {
      setLoading(true);
      
      // Load post and comments in parallel
      const [postResult, commentsResult] = await Promise.all([
        socialService.getPostById(postId as string),
        socialService.getPostComments(postId as string),
      ]);

      if (postResult.data) {
        setPost(postResult.data);
      } else if (postResult.error) {
        console.error('Error loading post:', postResult.error);
        showToast('Failed to load post', 'error');
      }

      if (commentsResult.data) {
        setComments(commentsResult.data);
      }
    } catch (error) {
      console.error('Error loading post details:', error);
      showToast('Failed to load post details', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleLike = async () => {
    if (!isAuthenticated) {
      showToast('Please sign in to like posts', 'info');
      return;
    }

    if (!post) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      if (post.isLikedByCurrentUser) {
        await socialService.unlikePost(post.id);
      } else {
        await socialService.likePost(post.id);
      }

      // Update local state
      setPost({
        ...post,
        isLikedByCurrentUser: !post.isLikedByCurrentUser,
        likesCount: post.isLikedByCurrentUser ? post.likesCount - 1 : post.likesCount + 1,
      });
    } catch (error) {
      console.error('Error toggling like:', error);
      showToast('Failed to update like', 'error');
    }
  };

  const handleShare = async () => {
    if (!post) return;

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }

    try {
      // Show loading toast while preparing share
      showToast('Preparing to share...', 'info');
      
      // Use the new share utility to format the share message with deep links
      // This now downloads the image locally first
      const shareOptions = await formatPostShareOptions(
        post.user?.name || 'Jagabans L.A.',
        post.caption,
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

  const handleSubmitComment = async () => {
    if (!isAuthenticated) {
      showToast('Please sign in to comment', 'info');
      return;
    }

    if (!commentText.trim()) {
      showToast('Please enter a comment', 'error');
      return;
    }

    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }

    setSubmittingComment(true);
    try {
      const { data, error } = await socialService.addComment(
        postId as string,
        commentText.trim(),
        replyingTo || undefined
      );

      if (error) throw error;

      // Reload comments
      await loadPostDetails();
      setCommentText('');
      setReplyingTo(null);
      showToast('Comment added!', 'success');
    } catch (error) {
      console.error('Error adding comment:', error);
      showToast('Failed to add comment', 'error');
    } finally {
      setSubmittingComment(false);
    }
  };

  const renderComment = ({ item, depth = 0 }: { item: Comment; depth?: number }) => (
    <View style={[styles.commentContainer, { marginLeft: depth * 20 }]}>
      <View style={styles.commentHeader}>
        {item.user?.profileImage ? (
          <Image source={{ uri: item.user.profileImage }} style={styles.commentAvatar} />
        ) : (
          <View style={[styles.commentAvatar, { backgroundColor: currentColors.secondary }]}>
            <IconSymbol
              name="person.fill"
              // android_material_icon_name="person"
              size={16}
              color={currentColors.background}
            />
          </View>
        )}
        <View style={styles.commentContent}>
          <Text style={[styles.commentUsername, { color: currentColors.text }]}>
            {item.user?.name || 'Unknown User'}
          </Text>
          <Text style={[styles.commentText, { color: currentColors.text }]}>
            {item.commentText}
          </Text>
          <View style={styles.commentActions}>
            <Text style={[styles.commentTime, { color: currentColors.textSecondary }]}>
              {getTimeAgo(item.createdAt)}
            </Text>
            <TouchableOpacity
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                setReplyingTo(item.id);
              }}
            >
              <Text style={[styles.replyButton, { color: currentColors.secondary }]}>
                Reply
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
      {item.replies && item.replies.length > 0 && (
        <View style={styles.repliesContainer}>
          {item.replies.map((reply) => (
            <React.Fragment key={reply.id}>
              {renderComment({ item: reply, depth: depth + 1 })}
            </React.Fragment>
          ))}
        </View>
      )}
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
            <TouchableOpacity 
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.back();
              }} 
              style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
            >
              <IconSymbol
                name="chevron.left"
                // android_material_icon_name="arrow-back"
                size={24}
                color={currentColors.secondary}
              />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Post</Text>
            <View style={styles.placeholder} />
          </LinearGradient>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={currentColors.secondary} />
          </View>
        </SafeAreaView>
      </LinearGradient>
    );
  }

  if (!post) {
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
            <TouchableOpacity 
              onPress={() => {
                if (Platform.OS !== 'web') {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                }
                router.back();
              }} 
              style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
            >
              <IconSymbol
                name="chevron.left"
                size={24}
                color={currentColors.secondary}
              />
            </TouchableOpacity>
            <Text style={[styles.headerTitle, { color: currentColors.text }]}>Post</Text>
            <View style={styles.placeholder} />
          </LinearGradient>
          <View style={styles.emptyContainer}>
            <IconSymbol
              name="exclamationmark.triangle"
              size={80}
              color={currentColors.textSecondary}
            />
            <Text style={[styles.emptyText, { color: currentColors.text }]}>
              Post not found
            </Text>
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
        {/* Header */}
        <LinearGradient
          colors={[currentColors.headerGradientStart || currentColors.card, currentColors.headerGradientEnd || currentColors.card]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { borderBottomColor: currentColors.border }]}
        >
          <TouchableOpacity 
            onPress={() => {
              if (Platform.OS !== 'web') {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              }
              router.back();
            }} 
            style={[styles.backButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
          >
            <IconSymbol
              name="chevron.left"
              size={24}
              color={currentColors.secondary}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: currentColors.text }]}>Post</Text>
          <TouchableOpacity 
            onPress={handleShare} 
            style={[styles.shareButton, { backgroundColor: currentColors.background, borderColor: currentColors.border }]}
          >
            <IconSymbol
              name="square.and.arrow.up"
              size={24}
              color={currentColors.secondary}
            />
          </TouchableOpacity>
        </LinearGradient>

        <KeyboardAvoidingView
          style={styles.keyboardAvoid}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
        >
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {/* Post Card */}
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
              <View style={styles.imageContainer}>
                <Image source={{ uri: post.imageUrl }} style={styles.postImage} />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.7)']}
                  style={styles.imageOverlay}
                />
                
                {/* User Info Overlay */}
                <View style={styles.userInfoOverlay}>
                  <View style={styles.userInfo}>
                    <View style={[styles.avatarContainer, { borderColor: currentColors.secondary }]}>
                      {post.user?.profileImage ? (
                        <Image source={{ uri: post.user.profileImage }} style={styles.avatar} />
                      ) : (
                        <LinearGradient
                          colors={[currentColors.secondary, currentColors.highlight]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={styles.avatar}
                        >
                          <IconSymbol
                            name="person.fill"
                            size={20}
                            color={currentColors.background}
                          />
                        </LinearGradient>
                      )}
                    </View>
                    <View style={styles.userDetails}>
                      <Text style={[styles.userName, { color: '#FFFFFF' }]}>
                        {post.user?.name || 'Unknown User'}
                      </Text>
                      {post.locationVerified && (
                        <View style={[styles.verifiedBadge, { backgroundColor: 'rgba(255,255,255,0.2)' }]}>
                          <IconSymbol
                            name="checkmark.seal.fill"
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

              {/* Post Actions with enhanced styling */}
              <View style={[styles.postActions, { borderTopColor: `${currentColors.border}40` }]}>
                <TouchableOpacity
                  style={styles.actionButton}
                  onPress={handleLike}
                  activeOpacity={0.7}
                >
                  <View style={[
                    styles.actionIconWrapper,
                    post.isLikedByCurrentUser && { backgroundColor: '#FF3B3015' }
                  ]}>
                    <IconSymbol
                      name={post.isLikedByCurrentUser ? 'heart.fill' : 'heart'}
                      size={22}
                      color={post.isLikedByCurrentUser ? '#FF3B30' : currentColors.text}
                    />
                  </View>
                  <Text style={[styles.actionText, { color: currentColors.text }]}>
                    {post.likesCount}
                  </Text>
                </TouchableOpacity>

                <View style={styles.actionButton}>
                  <View style={styles.actionIconWrapper}>
                    <IconSymbol
                      name="message"
                      size={22}
                      color={currentColors.text}
                    />
                  </View>
                  <Text style={[styles.actionText, { color: currentColors.text }]}>
                    {post.commentsCount}
                  </Text>
                </View>
              </View>

              {/* Caption with refined typography */}
              {post.caption && (
                <View style={styles.captionContainer}>
                  <Text style={[styles.caption, { color: currentColors.text }]}>
                    <Text style={[styles.captionUsername, { color: currentColors.text }]}>
                      {post.user?.name || 'User'}
                    </Text>
                    <Text style={[styles.captionText, { color: currentColors.textSecondary }]}>
                      {' '}{post.caption}
                    </Text>
                  </Text>
                </View>
              )}

              {/* Location Info */}
              {(post.ipAddress || post.locationCity) && (
                <View style={[styles.locationInfoContainer, { borderTopColor: `${currentColors.border}20` }]}>
                  {post.ipAddress && (
                    <Text style={[styles.locationInfoText, { color: currentColors.textSecondary }]}>
                      📍 IP: {post.ipAddress}
                    </Text>
                  )}
                  {post.locationCity && (
                    <Text style={[styles.locationInfoText, { color: currentColors.textSecondary }]}>
                      🌍 {post.locationCity}
                      {post.locationState && `, ${post.locationState}`}
                      {post.locationCountry && `, ${post.locationCountry}`}
                    </Text>
                  )}
                </View>
              )}

              {/* Timestamp with divider */}
              <View style={[styles.timestampContainer, { borderTopColor: `${currentColors.border}20` }]}>
                <Text style={[styles.timestamp, { color: currentColors.textSecondary }]}>
                  {getTimeAgo(post.createdAt)}
                </Text>
              </View>
            </LinearGradient>

            {/* Comments Section */}
            <View style={styles.commentsSection}>
              <Text style={[styles.commentsTitle, { color: currentColors.text }]}>
                Comments
              </Text>
              {comments.length === 0 ? (
                <View style={styles.noComments}>
                  <Text style={[styles.noCommentsText, { color: currentColors.textSecondary }]}>
                    No comments yet. Be the first to comment!
                  </Text>
                </View>
              ) : (
                comments.map((comment) => (
                  <React.Fragment key={comment.id}>
                    {renderComment({ item: comment })}
                  </React.Fragment>
                ))
              )}
            </View>
          </ScrollView>

          {/* Comment Input */}
          {isAuthenticated && (
            <LinearGradient
              colors={[currentColors.cardGradientStart || currentColors.card, currentColors.cardGradientEnd || currentColors.card]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.commentInputContainer, { borderTopColor: currentColors.border }]}
            >
              {replyingTo && (
                <View style={styles.replyingToContainer}>
                  <Text style={[styles.replyingToText, { color: currentColors.textSecondary }]}>
                    Replying to comment
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      if (Platform.OS !== 'web') {
                        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                      }
                      setReplyingTo(null);
                    }}
                  >
                    <IconSymbol
                      name="xmark.circle.fill"
                      size={20}
                      color={currentColors.textSecondary}
                    />
                  </TouchableOpacity>
                </View>
              )}
              <View style={styles.inputRow}>
                <TextInput
                  style={[
                    styles.commentInput,
                    {
                      color: currentColors.text,
                      backgroundColor: currentColors.background,
                      borderColor: currentColors.border,
                    },
                  ]}
                  placeholder="Add a comment..."
                  placeholderTextColor={currentColors.textSecondary}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  maxLength={500}
                />
                <TouchableOpacity
                  style={[
                    styles.sendButton,
                    {
                      backgroundColor: commentText.trim() ? currentColors.secondary : currentColors.border,
                    },
                  ]}
                  onPress={handleSubmitComment}
                  disabled={submittingComment || !commentText.trim()}
                >
                  {submittingComment ? (
                    <ActivityIndicator size="small" color={currentColors.background} />
                  ) : (
                    <IconSymbol
                      name="paperplane.fill"
                      size={20}
                      color={currentColors.background}
                    />
                  )}
                </TouchableOpacity>
              </View>
            </LinearGradient>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>
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
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  headerTitle: {
    fontSize: 32,
    fontFamily: 'PlayfairDisplay_700Bold',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  shareButton: {
    width: 40,
    height: 40,
    borderRadius: 0,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    boxShadow: '0px 4px 12px rgba(212, 175, 55, 0.25)',
    elevation: 4,
  },
  placeholder: {
    width: 40,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    fontFamily: 'Inter_400Regular',
    marginTop: 16,
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 20,
  },
  postCard: {
    borderRadius: 0,
    marginBottom: 20,
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
  commentsSection: {
    marginBottom: 20,
  },
  commentsTitle: {
    fontSize: 20,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 16,
  },
  noComments: {
    padding: 20,
    alignItems: 'center',
  },
  noCommentsText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
  },
  commentContainer: {
    marginBottom: 16,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  commentAvatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  commentContent: {
    flex: 1,
  },
  commentUsername: {
    fontSize: 14,
    fontFamily: 'Inter_600SemiBold',
    marginBottom: 4,
  },
  commentText: {
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    lineHeight: 20,
    marginBottom: 4,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  commentTime: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  replyButton: {
    fontSize: 12,
    fontFamily: 'Inter_600SemiBold',
  },
  repliesContainer: {
    marginTop: 8,
  },
  commentInputContainer: {
    borderTopWidth: 2,
    padding: 12,
    boxShadow: '0px -4px 12px rgba(0, 0, 0, 0.1)',
    elevation: 8,
  },
  replyingToContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  replyingToText: {
    fontSize: 12,
    fontFamily: 'Inter_400Regular',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  commentInput: {
    flex: 1,
    borderWidth: 2,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 8,
    fontSize: 14,
    fontFamily: 'Inter_400Regular',
    maxHeight: 100,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
